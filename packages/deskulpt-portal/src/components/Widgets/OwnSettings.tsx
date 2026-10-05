import { Checkbox, Select, Table, Text, TextField } from "@radix-ui/themes";
import { css } from "@emotion/react";
import { ChangeEvent } from "react";
import { DeskulptWidgets } from "@deskulpt/bindings";
import { useTranslation } from "@deskulpt/utils";
import { useWidgetsStore } from "../../hooks";
import IntegerInput from "../IntegerInput";

const styles = {
  table: css({
    "--table-cell-padding": "var(--space-1) var(--space-2)",
    "--table-cell-min-height": 0,
    "& tr": { "--table-row-box-shadow": "none" },
    "& th": { color: "var(--gray-11)", width: "132px" },
  }),
};

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
}: {
  id: string;
  spec: DeskulptWidgets.WidgetSettingSpec;
  value: DeskulptWidgets.WidgetConfigValue | undefined;
  disabled: boolean;
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
    const number = typeof current === "number" ? current : 0;
    return (
      <IntegerInput
        value={number}
        min={spec.min}
        max={spec.max}
        step={spec.step}
        disabled={disabled}
        onValueChange={(next) => writeConfig(id, spec.key, next)}
        width="60px"
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
              {choice.label}
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

const OwnSettings = ({ id }: { id: string }) => {
  const { t } = useTranslation();
  const widget = useWidgetsStore((state) => state[id]);
  const options =
    widget?.manifest.type === "ok"
      ? (widget.manifest.content.options ?? [])
      : [];
  if (options.length === 0) return null;

  return (
    <>
      <Text size="1" color="gray">
        {t("widgets.ownSettings")}
      </Text>
      <Table.Root size="1" layout="fixed" css={styles.table}>
        <Table.Body>
          {options.map((spec) => (
            <Table.Row key={spec.key} align="center">
              <Table.RowHeaderCell>{spec.label}</Table.RowHeaderCell>
              <Table.Cell>
                <OwnControl
                  id={id}
                  spec={spec}
                  value={widget?.settings.config?.[spec.key]}
                  disabled={
                    spec.whenKey !== undefined &&
                    widget?.settings.config?.[spec.whenKey] !== spec.whenValue
                  }
                />
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </>
  );
};

export default OwnSettings;
