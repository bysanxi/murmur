import { Select, Text, TextField } from "@radix-ui/themes";
import { css } from "@emotion/react";
import { useEffect, useRef, useState } from "react";
import { DeskulptWidgets } from "@deskulpt/bindings";
import { useTranslation } from "@deskulpt/utils";

const PREVIEW: Record<string, string> = {
  sans: '"Microsoft YaHei","PingFang SC","Segoe UI",sans-serif',
  kai: '"KaiTi","STKaiti","Kaiti SC","楷体",serif',
  song: '"SimSun","Songti SC","STSong","PMingLiU",serif',
};

const menu = css({
  "& > .rt-ScrollAreaRoot": {
    display: "flex",
    flexDirection: "column",
    maxHeight: "min(280px, var(--radix-select-content-available-height))",
  },
  "& > .rt-ScrollAreaRoot > .rt-ScrollAreaViewport": {
    overflow: "hidden !important",
  },
  "& > .rt-ScrollAreaRoot > .rt-ScrollAreaViewport > div": {
    display: "flex !important",
    flexDirection: "column",
    maxHeight: "min(280px, var(--radix-select-content-available-height))",
    minHeight: 0,
  },
  "& > .rt-ScrollAreaRoot > .rt-ScrollAreaScrollbar": {
    display: "none",
  },
});

const choices = css({
  minHeight: 0,
  maxHeight: 220,
  overflowY: "auto",
});

const previewOf = (name: string) => {
  if (PREVIEW[name]) return PREVIEW[name];
  return `"${name.replaceAll(/["\\]/g, "")}", sans-serif`;
};

let cachedFamilies: string[] | undefined;
let loadingFamilies: Promise<string[]> | undefined;

const fontFamilies = () => {
  if (cachedFamilies) return Promise.resolve(cachedFamilies);
  loadingFamilies ??= DeskulptWidgets.Commands.listFontFamilies()
    .then((names) => {
      cachedFamilies = names;
      return names;
    })
    .catch(() => []);
  return loadingFamilies;
};

const FontField = ({
  id,
  settingKey,
  value,
  disabled,
  presets,
}: {
  id: string;
  settingKey: string;
  value: string;
  disabled: boolean;
  presets: { value: string; label: string }[];
}) => {
  const { t } = useTranslation();
  const [families, setFamilies] = useState<string[]>(cachedFamilies ?? []);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const pinned = new Set(presets.map((preset) => preset.value));

  useEffect(() => {
    let cancel = false;
    fontFamilies().then((names) => {
      if (!cancel) setFamilies(names);
    });
    return () => {
      cancel = true;
    };
  }, []);

  const selected = value || presets[0]?.value || "";
  const needle = query.trim().toLowerCase();
  const matches = (label: string) =>
    !needle || label.toLowerCase().includes(needle);
  const presetHits = presets.filter((preset) => matches(preset.label));
  const familyHits = families.filter(
    (name) => !pinned.has(name) && matches(name),
  );
  const shown = new Set([
    ...presetHits.map((preset) => preset.value),
    ...familyHits,
  ]);

  return (
    <Select.Root
      size="1"
      disabled={disabled}
      value={selected}
      onOpenChange={(open) => {
        if (open) requestAnimationFrame(() => searchRef.current?.focus());
        else setQuery("");
      }}
      onValueChange={(next) =>
        DeskulptWidgets.Commands.updateSettings(id, {
          config: { [settingKey]: next },
        })
      }
    >
      <Select.Trigger style={{ fontFamily: previewOf(selected) }} />
      <Select.Content position="popper" css={menu}>
        <div
          style={{ flexShrink: 0, padding: "4px 4px 6px" }}
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <TextField.Root
            ref={searchRef}
            size="1"
            placeholder={t("widgets.fontSearch")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div css={choices}>
          {selected && !shown.has(selected) ? (
            <Select.Item value={selected} style={{ display: "none" }}>
              {selected}
            </Select.Item>
          ) : null}
          {presetHits.map((preset) => (
            <Select.Item
              key={preset.value}
              value={preset.value}
              style={{ fontFamily: previewOf(preset.value) }}
            >
              {preset.label}
            </Select.Item>
          ))}
          {familyHits.map((name) => (
            <Select.Item
              key={name}
              value={name}
              style={{ fontFamily: previewOf(name) }}
            >
              {name}
            </Select.Item>
          ))}
          {presetHits.length === 0 && familyHits.length === 0 ? (
            <Text size="1" color="gray" style={{ padding: "4px 8px" }}>
              {t("widgets.fontEmpty")}
            </Text>
          ) : null}
        </div>
      </Select.Content>
    </Select.Root>
  );
};

export default FontField;
