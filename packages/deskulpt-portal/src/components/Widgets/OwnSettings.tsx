import {
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
import { ChangeEvent } from "react";
import { LuRotateCcw } from "react-icons/lu";
import { DeskulptWidgets } from "@deskulpt/bindings";
import { useTranslation } from "@deskulpt/utils";
import { useWidgetsStore } from "../../hooks";
import SectionTable from "../Settings/SectionTable";
import CityField from "./CityField";
import FontField from "./FontField";

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
    value.en ??
    value["zh-CN"] ??
    Object.values(value)[0] ??
    ""
  );
};

const groupKey = (group: DeskulptWidgets.WidgetText) =>
  typeof group === "string"
    ? group
    : (group["zh-CN"] ?? group.en ?? Object.values(group)[0] ?? "");

const writeConfig = (
  id: string,
  key: string,
  value: DeskulptWidgets.WidgetConfigValue,
) => {
  DeskulptWidgets.Commands.updateSettings(id, { config: { [key]: value } });
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
