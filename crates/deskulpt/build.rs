use std::fs;
use std::path::Path;

fn main() {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let source = manifest_dir.join("../../public/murmur.png");
    let target = manifest_dir.join("icons/icon.ico");

    println!("cargo:rerun-if-changed={}", source.display());
    println!("cargo:rerun-if-changed={}", target.display());

    rebuild_icon_ico(&source, &target);
    tauri_build::build();
}

/// Regenerate `icons/icon.ico` from the brand source image.
///
/// The layer list must stay `24,32,48,64,256` with 24x24 first: the runtime
/// window icon is decoded from the first entry, and Windows upscales whichever
/// layer it picks for the taskbar — a 16x16 layer (what `tauri icon` ships)
/// is what made the taskbar icon blurry. Rebuilding on every build keeps the
/// file correct even after `tauri icon` overwrites it.
///
/// Layers are resampled with [`downscale`] rather than a plain filter:
/// filtering straight RGBA bleeds the transparent black background into the
/// edge pixels and renders as a dark fringe around the circle.
fn rebuild_icon_ico(source: &Path, target: &Path) {
    let image = image::open(source)
        .unwrap_or_else(|error| panic!("failed to open {}: {error}", source.display()))
        .into_rgba8();
    let image = center_crop_square(&image);

    let mut dir = ico::IconDir::new(ico::ResourceType::Icon);
    for size in [24u32, 32, 48, 64, 256] {
        let resized = downscale(&image, size);
        let layer = ico::IconImage::from_rgba_data(size, size, resized.into_raw());
        let entry = ico::IconDirEntry::encode_as_png(&layer)
            .unwrap_or_else(|error| panic!("failed to encode {size}x{size} layer: {error}"));
        dir.add_entry(entry);
    }

    let mut bytes = Vec::new();
    dir.write(&mut bytes).expect("failed to encode icon.ico");

    // Only rewrite on actual changes so incremental builds keep the file's
    // mtime stable and do not trigger rebuild cascades.
    if fs::read(target).ok().as_deref() == Some(bytes.as_slice()) {
        return;
    }
    fs::write(target, &bytes)
        .unwrap_or_else(|error| panic!("failed to write {}: {error}", target.display()));
}

fn center_crop_square(image: &image::RgbaImage) -> image::RgbaImage {
    let (width, height) = image.dimensions();
    if width == height {
        return image.clone();
    }
    let side = width.min(height);
    let x = (width - side) / 2;
    let y = (height - side) / 2;
    image::imageops::crop_imm(image, x, y, side, side).to_image()
}

/// Exact area-average downsample.
///
/// Each target pixel is the weighted mean of the source pixels it covers,
/// computed on premultiplied color so fully transparent pixels contribute
/// nothing to the edge color, then unpremultiplied back. The box footprint is
/// the correct low-pass filter for a display raster: coverage values are exact
/// per-pixel circle intersections, which is as smooth as 24x24 gets.
fn downscale(source: &image::RgbaImage, side: u32) -> image::RgbaImage {
    let (width, height) = source.dimensions();
    let ratio_x = f64::from(width) / f64::from(side);
    let ratio_y = f64::from(height) / f64::from(side);
    let cell = ratio_x * ratio_y;
    let mut out = image::RgbaImage::new(side, side);

    for ty in 0..side {
        let y0 = f64::from(ty) * ratio_y;
        let y1 = y0 + ratio_y;
        for tx in 0..side {
            let x0 = f64::from(tx) * ratio_x;
            let x1 = x0 + ratio_x;

            let mut sum = [0.0f64; 4];
            for sy in (y0.floor() as u32)..(y1.ceil() as u32).min(height) {
                let weight_y = (f64::from(sy) + 1.0).min(y1) - f64::from(sy).max(y0);
                if weight_y <= 0.0 {
                    continue;
                }
                for sx in (x0.floor() as u32)..(x1.ceil() as u32).min(width) {
                    let weight_x = (f64::from(sx) + 1.0).min(x1) - f64::from(sx).max(x0);
                    if weight_x <= 0.0 {
                        continue;
                    }
                    let weight = weight_x * weight_y;
                    let pixel = source.get_pixel(sx, sy);
                    let alpha = f64::from(pixel[3]) / 255.0;
                    sum[0] += f64::from(pixel[0]) * alpha * weight;
                    sum[1] += f64::from(pixel[1]) * alpha * weight;
                    sum[2] += f64::from(pixel[2]) * alpha * weight;
                    sum[3] += alpha * weight;
                }
            }

            let alpha = sum[3] / cell;
            let unpremultiply = |premultiplied: f64| -> u8 {
                if alpha <= 0.0 {
                    return 0;
                }
                (premultiplied / cell / alpha).round().clamp(0.0, 255.0) as u8
            };
            out.put_pixel(
                tx,
                ty,
                image::Rgba([
                    unpremultiply(sum[0]),
                    unpremultiply(sum[1]),
                    unpremultiply(sum[2]),
                    (alpha * 255.0).round().clamp(0.0, 255.0) as u8,
                ]),
            );
        }
    }
    out
}
