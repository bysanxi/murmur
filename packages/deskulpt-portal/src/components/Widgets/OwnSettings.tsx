import {
  Button,
  Checkbox,
  Flex,
  IconButton,
  Select,
  Slider,
  Table,
  Text,
  TextField,
} from "@radix-ui/themes";
import { css } from "@emotion/react";
import { ChangeEvent, useEffect, useState } from "react";
import { LuRotateCcw } from "react-icons/lu";
import { DeskulptWidgets } from "@deskulpt/bindings";
import { useTranslation } from "@deskulpt/utils";
import { useWidgetsStore } from "../../hooks";
import SectionTable from "../Settings/SectionTable";
import CityField from "./CityField";
import FontField from "./FontField";
import { loadRadioCountryCounts } from "./radioCountryCounts";
import {
  type RadioCacheStatus,
  loadRadioCacheStatus,
} from "./radioCacheStatus";

const styles = {
  table: css({
    "--table-cell-padding": "var(--space-1) var(--space-2)",
    "--table-cell-min-height": 0,
    "& tr": { "--table-row-box-shadow": "none" },
    "& th": { color: "var(--gray-11)", width: "132px" },
  }),
};

const widgetText = (
  value: DeskulptWidgets.WidgetText | undefined,
  language: string,
) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  return (
    value[language] ??
    value["en"] ??
    value["zh-CN"] ??
    Object.values(value)[0] ??
    ""
  );
};

const groupKey = (group: DeskulptWidgets.WidgetText) =>
  typeof group === "string"
    ? group
    : (group["zh-CN"] ?? group["en"] ?? Object.values(group)[0] ?? "");

const writeConfig = (
  id: string,
  key: string,
  value: DeskulptWidgets.WidgetConfigValue,
) => {
  DeskulptWidgets.Commands.updateSettings(id, { config: { [key]: value } });
};

/// Radio "From" select: options are ISO country codes (plus "random").
const isCountrySelect = (spec: DeskulptWidgets.WidgetSettingSpec) =>
  spec.type === "select" &&
  spec.key === "country" &&
  (spec.options ?? []).some((choice) => /^[A-Z]{2}$/.test(choice.value));

const withCount = (label: string, count: number | undefined) =>
  count != null && count > 0 ? `${label} · ${count}` : label;

const CountrySelect = ({
  id,
  spec,
  value,
  disabled,
  language,
}: {
  id: string;
  spec: DeskulptWidgets.WidgetSettingSpec;
  value: DeskulptWidgets.WidgetConfigValue | undefined;
  disabled: boolean;
  language: string;
}) => {
  const choices = spec.options ?? [];
  const current = value ?? spec.default;
  const selected =
    typeof current === "string" ? current : (choices[0]?.value ?? "");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let alive = true;
    void loadRadioCountryCounts().then((data) => {
      if (!alive) return;
      setCounts(data.byCode);
      setTotal(data.total);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (choices.length === 0) return null;
  return (
    <Select.Root
      size="1"
      disabled={disabled}
      value={selected}
      onValueChange={(next) => writeConfig(id, spec.key, next)}
    >
      <Select.Trigger />
      <Select.Content>
        {choices.map((choice) => {
          const base = widgetText(choice.label, language);
          const count =
            choice.value === "random" ? total : counts[choice.value];
          return (
            <Select.Item key={choice.value} value={choice.value}>
              {withCount(base, count)}
            </Select.Item>
          );
        })}
      </Select.Content>
    </Select.Root>
  );
};

const formatCacheTime = (ts: number, language: string) => {
  try {
    return new Date(ts).toLocaleString(language === "en" ? "en" : "zh-CN", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
};

const cacheCaption = (
  enabled: boolean,
  status: RadioCacheStatus,
  language: string,
) => {
  const zh = language !== "en";
  const n = status.count;
  if (!enabled) {
    return zh
      ? "关掉会删掉已下载的列表，换台改走在线抽查。"
      : "Off deletes the saved list; stations are then picked online.";
  }
  if (status.state === "downloading") {
    return zh
      ? n > 0
        ? `正在下载… 已收到 ${n} 台`
        : "正在下载电台列表…"
      : n > 0
        ? `Downloading… ${n} stations so far`
        : "Downloading station list…";
  }
  if (status.state === "ready" && n > 0) {
    const when = status.fetchedAt
      ? formatCacheTime(status.fetchedAt, language)
      : "";
    return zh
      ? when
        ? `已缓存 ${n} 台 · ${when}`
        : `已缓存 ${n} 台`
      : when
        ? `Cached ${n} stations · ${when}`
        : `Cached ${n} stations`;
  }
  if (status.state === "stale" && n > 0) {
    return zh
      ? `这次没下完，仍用上次的 ${n} 台`
      : `Refresh failed; still using ${n} saved stations`;
  }
  if (status.state === "error") {
    return zh
      ? "下载失败，换台先走在线抽查。"
      : "Download failed; using online picks for now.";
  }
  return zh
    ? "打开后会在后台下载完整列表，地球上的台会更多。"
    : "When on, the full list downloads in the background so the globe can fill in.";
};

const RadioCacheControl = ({
  id,
  spec,
  value,
  disabled,
  language,
}: {
  id: string;
  spec: DeskulptWidgets.WidgetSettingSpec;
  value: DeskulptWidgets.WidgetConfigValue | undefined;
  disabled: boolean;
  language: string;
}) => {
  const enabled = (value ?? spec.default) === true;
  const [status, setStatus] = useState<RadioCacheStatus>({
    state: "off",
    count: 0,
    fetchedAt: null,
  });

  useEffect(() => {
    let alive = true;
    const tick = () => {
      void loadRadioCacheStatus(id).then((next) => {
        if (alive) setStatus(next);
      });
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [id, enabled]);

  const zh = language !== "en";
  const busy = enabled && status.state === "downloading";

  return (
    <Flex direction="column" gap="1" width="100%" minWidth="0">
      <Flex align="center" gap="2">
        <Checkbox
          size="1"
          disabled={disabled}
          checked={enabled}
          onCheckedChange={(checked) =>
            writeConfig(id, spec.key, checked === true)
          }
        />
        <Button
          size="1"
          variant="soft"
          color="gray"
          disabled={disabled || !enabled || busy}
          onClick={() => writeConfig(id, "cacheRefresh", Date.now())}
        >
          {busy
            ? zh
              ? "下载中"
              : "Downloading"
            : zh
              ? "重新下载"
              : "Redownload"}
        </Button>
      </Flex>
      <Text size="1" color="gray" style={{ lineHeight: 1.35 }}>
        {cacheCaption(enabled, status, language)}
      </Text>
    </Flex>
  );
};

const OwnControl = ({
  id,
  spec,
  value,
  disabled,
  language,
}: {
  id: string;
  spec: DeskulptWidgets.WidgetSettingSpec;
  value: DeskulptWidgets.WidgetConfigValue | undefined;
  disabled: boolean;
  language: string;
}) => {
  const current = value ?? spec.default;

  if (spec.type === "bool") {
    if (spec.key === "cacheCatalog") {
      return (
        <RadioCacheControl
          id={id}
          spec={spec}
          value={value}
          disabled={disabled}
          language={language}
        />
      );
    }
    return (
      <Checkbox
        size="1"
        disabled={disabled}
        checked={current === true}
        onCheckedChange={(checked) =>
          writeConfig(id, spec.key, checked === true)
        }
      />
    );
  }

  if (spec.type === "number") {
    const min = spec.min ?? 0;
    const max = spec.max ?? min + 1;
    const step = spec.step ?? 1;
    const raw = typeof current === "number" ? current : min;
    const places = step.toString().split(".")[1]?.length ?? 0;
    const number = Math.min(
      max,
      Math.max(min, min + Math.round((raw - min) / step) * step),
    );
    return (
      <Flex align="center" gap="2" width="33%" minWidth="0">
        <Slider
          size="1"
          variant="surface"
          disabled={disabled}
          min={min}
          max={max}
          step={step}
          value={[number]}
          onValueChange={([next]) => {
            if (next === undefined) return;
            const snapped = Math.min(
              max,
              Math.max(min, min + Math.round((next - min) / step) * step),
            );
            writeConfig(id, spec.key, Number(snapped.toFixed(places)));
          }}
          style={{ flex: 1, width: "auto", minWidth: 0 }}
        />
        <Text
          size="1"
          color="gray"
          style={{ width: "2.4rem", textAlign: "right", flexShrink: 0 }}
        >
          {number.toFixed(places)}
        </Text>
      </Flex>
    );
  }

  if (spec.type === "font") {
    return (
      <FontField
        id={id}
        settingKey={spec.key}
        value={typeof current === "string" ? current : ""}
        disabled={disabled}
        presets={(spec.options ?? []).map((choice) => ({
          value: choice.value,
          label: widgetText(choice.label, language),
        }))}
      />
    );
  }

  if (spec.type === "city") {
    return (
      <CityField
        id={id}
        settingKey={spec.key}
        value={typeof current === "string" ? current : undefined}
        disabled={disabled}
      />
    );
  }

  if (spec.type === "select") {
    if (isCountrySelect(spec)) {
      return (
        <CountrySelect
          id={id}
          spec={spec}
          value={value}
          disabled={disabled}
          language={language}
        />
      );
    }
    const choices = spec.options ?? [];
    const selected =
      typeof current === "string" ? current : (choices[0]?.value ?? "");
    if (choices.length === 0) return null;
    return (
      <Select.Root
        size="1"
        disabled={disabled}
        value={selected}
        onValueChange={(next) => writeConfig(id, spec.key, next)}
      >
        <Select.Trigger />
        <Select.Content>
          {choices.map((choice) => (
            <Select.Item key={choice.value} value={choice.value}>
              {widgetText(choice.label, language)}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    );
  }

  const text = typeof current === "string" ? current : "";
  return (
    <TextField.Root
      size="1"
      disabled={disabled}
      value={text}
      onChange={(event: ChangeEvent<HTMLInputElement>) =>
        writeConfig(id, spec.key, event.target.value)
      }
    />
  );
};

const sameValue = (
  stored: DeskulptWidgets.WidgetConfigValue | undefined,
  fallback: DeskulptWidgets.WidgetConfigValue | undefined,
) => stored === undefined || stored === fallback;

const SettingRow = ({
  id,
  spec,
  config,
  language,
}: {
  id: string;
  spec: DeskulptWidgets.WidgetSettingSpec;
  config: Record<string, DeskulptWidgets.WidgetConfigValue> | undefined;
  language: string;
}) => {
  const { t } = useTranslation();
  const fallback = spec.default;
  const disabled =
    spec.disableKey !== undefined &&
    config?.[spec.disableKey] === spec.disableValue;
  return (
    <Table.Row align="center">
      <Table.RowHeaderCell
        style={{ color: disabled ? "var(--gray-9)" : undefined }}
      >
        {widgetText(spec.label, language)}
      </Table.RowHeaderCell>
      <Table.Cell>
        <Flex align="center" gap="2">
          <Flex align="center" flexGrow="1" minWidth="0">
            <OwnControl
              id={id}
              spec={spec}
              value={config?.[spec.key]}
              disabled={disabled}
              language={language}
            />
          </Flex>
          {fallback !== undefined ? (
            <IconButton
              size="1"
              variant="ghost"
              color="gray"
              disabled={disabled || sameValue(config?.[spec.key], fallback)}
              title={t("widgets.reset")}
              style={{ flexShrink: 0 }}
              onClick={() => writeConfig(id, spec.key, fallback)}
            >
              <LuRotateCcw />
            </IconButton>
          ) : null}
        </Flex>
      </Table.Cell>
    </Table.Row>
  );
};

const grouped = (options: DeskulptWidgets.WidgetSettingSpec[]) => {
  const loose: DeskulptWidgets.WidgetSettingSpec[] = [];
  const boxes: {
    key: string;
    title: DeskulptWidgets.WidgetText;
    options: DeskulptWidgets.WidgetSettingSpec[];
  }[] = [];
  for (const spec of options) {
    const title = spec.group;
    if (!title) {
      loose.push(spec);
      continue;
    }
    const key = groupKey(title);
    const box = boxes.find((item) => item.key === key);
    if (box) box.options.push(spec);
    else boxes.push({ key, title, options: [spec] });
  }
  return { loose, boxes };
};

const OwnSettings = ({ id }: { id: string }) => {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const widget = useWidgetsStore((state) => state[id]);
  const options =
    widget?.manifest.type === "ok"
      ? (widget.manifest.content.options ?? [])
      : [];
  if (options.length === 0) return null;

  const config = widget?.settings.config;
  const visible = options.filter((spec) => {
    if (spec.whenKey !== undefined && config?.[spec.whenKey] !== spec.whenValue)
      return false;
    if (
      spec.unlessKey !== undefined &&
      config?.[spec.unlessKey] === spec.unlessValue
    )
      return false;
    return true;
  });
  if (visible.length === 0) return null;
  const { loose, boxes } = grouped(visible);

  return (
    <Flex direction="column" gap="4">
      {boxes.length === 0 ? (
        <Text size="1" color="gray">
          {t("widgets.ownSettings")}
        </Text>
      ) : null}
      {loose.length > 0 ? (
        <Table.Root size="1" layout="fixed" css={styles.table}>
          <Table.Body>
            {loose.map((spec) => (
              <SettingRow
                key={spec.key}
                id={id}
                spec={spec}
                config={config}
                language={language}
              />
            ))}
          </Table.Body>
        </Table.Root>
      ) : null}
      {boxes.map((box) => (
        <SectionTable
          key={box.key}
          title={widgetText(box.title, language)}
          labelWidth="132px"
        >
          {box.options.map((spec) => (
            <SettingRow
              key={spec.key}
              id={id}
              spec={spec}
              config={config}
              language={language}
            />
          ))}
        </SectionTable>
      ))}
    </Flex>
  );
};

export default OwnSettings;
