import { Checkbox, Flex, Table, Text } from "@radix-ui/themes";
import { LuX } from "react-icons/lu";
import { useWidgetsStore } from "../../hooks";
import IntegerInput from "../IntegerInput";
import { css } from "@emotion/react";
import { DeskulptWidgets } from "@deskulpt/bindings";
import { useTranslation } from "@deskulpt/utils";

const styles = {
  table: css({
    "--table-cell-padding": "var(--space-1) var(--space-2)",
    "--table-cell-min-height": 0,
    "& tr": { "--table-row-box-shadow": "none" },
    "& th": { color: "var(--gray-11)", width: "132px" },
  }),
};

const X = ({ id }: SettingsProps) => {
  const x = useWidgetsStore((state) => state[id]?.settings.x);
  const fullscreen = useWidgetsStore((state) => state[id]?.settings.fullscreen);

  return (
    <IntegerInput
      value={x}
      min={0}
      disabled={fullscreen}
      onValueChange={(value: number) =>
        DeskulptWidgets.Commands.updateSettings(id, { x: value })
      }
      width="60px"
    />
  );
};

const Y = ({ id }: SettingsProps) => {
  const y = useWidgetsStore((state) => state[id]?.settings.y);
  const fullscreen = useWidgetsStore((state) => state[id]?.settings.fullscreen);

  return (
    <IntegerInput
      value={y}
      min={0}
      disabled={fullscreen}
      onValueChange={(value: number) =>
        DeskulptWidgets.Commands.updateSettings(id, { y: value })
      }
      width="60px"
    />
  );
};

const Width = ({ id }: SettingsProps) => {
  const width = useWidgetsStore((state) => state[id]?.settings.width);
  const fullscreen = useWidgetsStore((state) => state[id]?.settings.fullscreen);

  return (
    <IntegerInput
      value={width}
      min={0}
      disabled={fullscreen}
      onValueChange={(value: number) =>
        DeskulptWidgets.Commands.updateSettings(id, { width: value })
      }
      width="60px"
    />
  );
};

const Height = ({ id }: SettingsProps) => {
  const height = useWidgetsStore((state) => state[id]?.settings.height);
  const fullscreen = useWidgetsStore((state) => state[id]?.settings.fullscreen);

  return (
    <IntegerInput
      value={height}
      min={0}
      disabled={fullscreen}
      onValueChange={(value: number) =>
        DeskulptWidgets.Commands.updateSettings(id, { height: value })
      }
      width="60px"
    />
  );
};

const ZIndex = ({ id }: SettingsProps) => {
  const zIndex = useWidgetsStore((state) => state[id]?.settings.zIndex);

  return (
    <IntegerInput
      value={zIndex}
      min={-999}
      max={999}
      onValueChange={(value: number) =>
        DeskulptWidgets.Commands.updateSettings(id, { zIndex: value })
      }
      width="60px"
    />
  );
};

const BackgroundOpacity = ({ id }: SettingsProps) => {
  const backgroundOpacity = useWidgetsStore(
    (state) => state[id]?.settings.backgroundOpacity,
  );

  return (
    <IntegerInput
      value={backgroundOpacity}
      min={0}
      max={100}
      onValueChange={(value: number) =>
        DeskulptWidgets.Commands.updateSettings(id, {
          backgroundOpacity: value,
        })
      }
      width="60px"
    />
  );
};

const Opacity = ({ id }: SettingsProps) => {
  const opacity = useWidgetsStore((state) => state[id]?.settings.opacity);

  return (
    <IntegerInput
      value={opacity}
      min={1}
      max={100}
      onValueChange={(value: number) =>
        DeskulptWidgets.Commands.updateSettings(id, { opacity: value })
      }
      width="60px"
    />
  );
};

X.displayName = "Settings.X";
Y.displayName = "Settings.Y";
Width.displayName = "Settings.Width";
Height.displayName = "Settings.Height";
ZIndex.displayName = "Settings.ZIndex";
BackgroundOpacity.displayName = "Settings.BackgroundOpacity";
Opacity.displayName = "Settings.Opacity";

const Fullscreen = ({ id }: SettingsProps) => {
  const { t } = useTranslation();
  const fullscreen = useWidgetsStore((state) => state[id]?.settings.fullscreen);

  return (
    <Text as="label" size="1" color="gray" ml="2">
      <Flex align="center" gap="1">
        <Checkbox
          size="1"
          checked={fullscreen ?? false}
          onCheckedChange={(checked) => {
            DeskulptWidgets.Commands.updateSettings(id, {
              fullscreen: checked === true,
            });
          }}
        />
        {t("widgets.fullscreen")}
      </Flex>
    </Text>
  );
};

Fullscreen.displayName = "Settings.Fullscreen";

interface SettingsProps {
  id: string;
}

const Settings = ({ id }: SettingsProps) => {
  const { t } = useTranslation();
  return (
    <Table.Root size="1" layout="fixed" css={styles.table}>
      <Table.Body>
        <Table.Row align="center">
          <Table.RowHeaderCell>{t("widgets.position")}</Table.RowHeaderCell>
          <Table.Cell>
            <Flex gap="1" align="center">
              <X id={id} />
              <LuX size={12} color="var(--gray-11)" />
              <Y id={id} />
            </Flex>
          </Table.Cell>
        </Table.Row>
        <Table.Row align="center">
          <Table.RowHeaderCell>{t("widgets.size")}</Table.RowHeaderCell>
          <Table.Cell>
            <Flex gap="1" align="center">
              <Width id={id} />
              <LuX size={12} color="var(--gray-11)" />
              <Height id={id} />
              <Fullscreen id={id} />
            </Flex>
          </Table.Cell>
        </Table.Row>
        <Table.Row align="center">
          <Table.RowHeaderCell>{t("widgets.zIndex")}</Table.RowHeaderCell>
          <Table.Cell>
            <ZIndex id={id} />
          </Table.Cell>
        </Table.Row>
        <Table.Row align="center">
          <Table.RowHeaderCell>{t("widgets.opacity")}</Table.RowHeaderCell>
          <Table.Cell>
            <Opacity id={id} />
          </Table.Cell>
        </Table.Row>
        <Table.Row align="center">
          <Table.RowHeaderCell>
            {t("widgets.backgroundOpacity")}
          </Table.RowHeaderCell>
          <Table.Cell>
            <BackgroundOpacity id={id} />
          </Table.Cell>
        </Table.Row>
      </Table.Body>
    </Table.Root>
  );
};

export default Settings;
