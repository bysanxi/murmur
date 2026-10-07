//! Installed font families. The webview cannot list these itself.

use std::collections::BTreeSet;
use std::sync::OnceLock;

static FAMILIES: OnceLock<Vec<String>> = OnceLock::new();

/// Family names installed on this computer, sorted and without duplicates.
pub fn font_families() -> Vec<String> {
    FAMILIES.get_or_init(load).clone()
}

fn load() -> Vec<String> {
    let mut names = BTreeSet::new();
    for name in platform_families() {
        let name = name.trim();
        if name.is_empty() || name.starts_with('@') || name.starts_with('.') {
            continue;
        }
        names.insert(name.to_string());
    }
    names.into_iter().collect()
}

#[cfg(windows)]
fn platform_families() -> Vec<String> {
    use windows::Win32::Graphics::DirectWrite::{
        DWRITE_FACTORY_TYPE_SHARED, DWriteCreateFactory, IDWriteFactory,
    };

    let factory: IDWriteFactory = match unsafe { DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED) } {
        Ok(factory) => factory,
        Err(_) => return Vec::new(),
    };
    let mut slot = None;
    if unsafe { factory.GetSystemFontCollection(&mut slot, false) }.is_err() {
        return Vec::new();
    }
    let Some(collection) = slot else {
        return Vec::new();
    };
    let locale = user_locale();
    let mut names = Vec::new();
    let count = unsafe { collection.GetFontFamilyCount() };
    for index in 0..count {
        let Ok(family) = (unsafe { collection.GetFontFamily(index) }) else {
            continue;
        };
        let Ok(family_names) = (unsafe { family.GetFamilyNames() }) else {
            continue;
        };
        let string_index = locale_index(&family_names, &locale);
        let Ok(length) = (unsafe { family_names.GetStringLength(string_index) }) else {
            continue;
        };
        let mut buffer = vec![0u16; length as usize + 1];
        if unsafe { family_names.GetString(string_index, &mut buffer) }.is_err() {
            continue;
        }
        buffer.pop();
        names.push(String::from_utf16_lossy(&buffer));
    }
    drop(factory);
    names
}

#[cfg(windows)]
fn user_locale() -> Vec<u16> {
    use windows::Win32::Globalization::GetUserDefaultLocaleName;

    let mut buffer = [0u16; 85];
    let length = unsafe { GetUserDefaultLocaleName(&mut buffer) };
    if length > 1 {
        buffer[..(length as usize - 1)].to_vec()
    } else {
        "en-us".encode_utf16().collect()
    }
}

#[cfg(windows)]
fn locale_index(
    names: &windows::Win32::Graphics::DirectWrite::IDWriteLocalizedStrings,
    locale: &[u16],
) -> u32 {
    use windows::core::PCWSTR;

    let mut locale = locale.to_vec();
    locale.push(0);
    if let Some(index) = find_locale(names, PCWSTR(locale.as_ptr())) {
        return index;
    }
    let english: Vec<u16> = "en-us".encode_utf16().chain(Some(0)).collect();
    if let Some(index) = find_locale(names, PCWSTR(english.as_ptr())) {
        return index;
    }
    0
}

#[cfg(windows)]
fn find_locale(
    names: &windows::Win32::Graphics::DirectWrite::IDWriteLocalizedStrings,
    locale: windows::core::PCWSTR,
) -> Option<u32> {
    let mut index = 0u32;
    let mut exists = windows::core::BOOL(0);
    unsafe { names.FindLocaleName(locale, &mut index, &mut exists) }.ok()?;
    exists.as_bool().then_some(index)
}

#[cfg(target_os = "macos")]
fn platform_families() -> Vec<String> {
    use std::ffi::c_void;

    #[link(name = "CoreText", kind = "framework")]
    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CTFontManagerCopyAvailableFontFamilyNames() -> *const c_void;
        fn CFArrayGetCount(array: *const c_void) -> isize;
        fn CFArrayGetValueAtIndex(array: *const c_void, index: isize) -> *const c_void;
        fn CFStringGetCString(
            string: *const c_void,
            buffer: *mut u8,
            size: isize,
            encoding: u32,
        ) -> bool;
        fn CFRelease(value: *const c_void);
    }

    const UTF8: u32 = 0x0800_0100;
    let array = unsafe { CTFontManagerCopyAvailableFontFamilyNames() };
    if array.is_null() {
        return Vec::new();
    }
    let mut names = Vec::new();
    let count = unsafe { CFArrayGetCount(array) };
    for index in 0..count {
        let string = unsafe { CFArrayGetValueAtIndex(array, index) };
        if string.is_null() {
            continue;
        }
        let mut buffer = [0u8; 512];
        let ok =
            unsafe { CFStringGetCString(string, buffer.as_mut_ptr(), buffer.len() as isize, UTF8) };
        if !ok {
            continue;
        }
        let end = buffer
            .iter()
            .position(|byte| *byte == 0)
            .unwrap_or(buffer.len());
        if let Ok(name) = std::str::from_utf8(&buffer[..end]) {
            names.push(name.to_string());
        }
    }
    unsafe { CFRelease(array) };
    names
}

#[cfg(target_os = "linux")]
fn platform_families() -> Vec<String> {
    use std::ffi::{CStr, c_char, c_int, c_void};

    #[repr(C)]
    struct FcFontSet {
        nfont: c_int,
        sfont: c_int,
        fonts: *mut *mut c_void,
    }

    unsafe extern "C" {
        fn dlopen(filename: *const c_char, flags: c_int) -> *mut c_void;
        fn dlsym(handle: *mut c_void, symbol: *const c_char) -> *mut c_void;
    }

    type Init = unsafe extern "C" fn() -> *mut c_void;
    type PatternCreate = unsafe extern "C" fn() -> *mut c_void;
    type ObjectSetCreate = unsafe extern "C" fn() -> *mut c_void;
    type ObjectSetAdd = unsafe extern "C" fn(*mut c_void, *const c_char) -> c_int;
    type FontList = unsafe extern "C" fn(*mut c_void, *mut c_void, *mut c_void) -> *mut FcFontSet;
    type PatternGetString =
        unsafe extern "C" fn(*mut c_void, *const c_char, c_int, *mut *mut u8) -> c_int;
    type Destroy = unsafe extern "C" fn(*mut c_void);

    unsafe fn load<T>(library: *mut c_void, name: &std::ffi::CStr) -> Option<T> {
        let symbol = dlsym(library, name.as_ptr());
        if symbol.is_null() {
            None
        } else {
            Some(std::mem::transmute_copy(&symbol))
        }
    }

    let library = unsafe { dlopen(c"libfontconfig.so.1".as_ptr(), 1) };
    if library.is_null() {
        return Vec::new();
    }
    let Some(init) = (unsafe { load::<Init>(library, c"FcInitLoadConfigAndFonts") }) else {
        return Vec::new();
    };
    let Some(pattern_create) = (unsafe { load::<PatternCreate>(library, c"FcPatternCreate") })
    else {
        return Vec::new();
    };
    let Some(set_create) = (unsafe { load::<ObjectSetCreate>(library, c"FcObjectSetCreate") })
    else {
        return Vec::new();
    };
    let Some(set_add) = (unsafe { load::<ObjectSetAdd>(library, c"FcObjectSetAdd") }) else {
        return Vec::new();
    };
    let Some(font_list) = (unsafe { load::<FontList>(library, c"FcFontList") }) else {
        return Vec::new();
    };
    let Some(get_string) = (unsafe { load::<PatternGetString>(library, c"FcPatternGetString") })
    else {
        return Vec::new();
    };
    let pattern_destroy = unsafe { load::<Destroy>(library, c"FcPatternDestroy") };
    let set_destroy = unsafe { load::<Destroy>(library, c"FcObjectSetDestroy") };
    let font_set_destroy = unsafe { load::<Destroy>(library, c"FcFontSetDestroy") };

    let config = unsafe { init() };
    let pattern = unsafe { pattern_create() };
    let objects = unsafe { set_create() };
    if config.is_null() || pattern.is_null() || objects.is_null() {
        return Vec::new();
    }
    unsafe { set_add(objects, c"family".as_ptr()) };
    let set = unsafe { font_list(config, pattern, objects) };
    let mut names = Vec::new();
    if !set.is_null() {
        let set_ref = unsafe { &*set };
        for index in 0..set_ref.nfont {
            let font = unsafe { *set_ref.fonts.add(index as usize) };
            let mut value = std::ptr::null_mut();
            if unsafe { get_string(font, c"family".as_ptr(), 0, &mut value) } == 0
                && !value.is_null()
            {
                if let Ok(name) = unsafe { CStr::from_ptr(value.cast()) }.to_str() {
                    names.push(name.to_string());
                }
            }
        }
        if let Some(destroy) = font_set_destroy {
            unsafe { destroy(set.cast()) };
        }
    }
    if let Some(destroy) = set_destroy {
        unsafe { destroy(objects) };
    }
    if let Some(destroy) = pattern_destroy {
        unsafe { destroy(pattern) };
    }
    names
}

#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
fn platform_families() -> Vec<String> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    #[test]
    fn lists_installed_families() {
        let names = super::font_families();
        assert!(names.len() > 10, "expected system fonts, got {names:?}");
        assert!(
            names
                .iter()
                .all(|name| !name.starts_with('@') && !name.starts_with('.'))
        );
    }
}
