import { Checkbox, Flex, IconButton, Table, Text } from "@radix-ui/themes";
import { LuRotateCcw, LuX } from "react-icons/lu";
import { useWidgetsStore } from "../../hooks";
import IntegerInput from "../IntegerInput";
import { DeskulptWidgets } from "@deskulpt/bindings";
import OwnSettings from "./OwnSettings";
import SectionTable from "../Settings/SectionTable";
import { useTranslation } from "@deskulpt/utils";
import type { ReactNode } from "react";

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

const HOST = {
  x: 0,
  y: 0,
  width: 300,
  height: 200,
  opacity: 100,
  backgroundOpacity: 100,
  zIndex: 0,
};

const ResetButton = ({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <IconButton
      size="1"
      variant="ghost"
      color="gray"
      disabled={disabled}
      title={t("widgets.reset")}
      style={{ flexShrink: 0 }}
      onClick={onClick}
    >
      <LuRotateCcw />
    </IconButton>
  );
};

const SettingCell = ({
  children,
  reset,
}: {
  children: ReactNode;
  reset: ReactNode;
}) => (
  <Flex align="center" gap="2">
    <Flex align="center" flexGrow="1" minWidth="0">
      {children}
    </Flex>
    {reset}
  </Flex>
);

const Settings = ({ id }: SettingsProps) => {
  const { t } = useTranslation();
  const widget = useWidgetsStore((state) => state[id]);
  const settings = widget?.settings;
  const manifest =
    widget?.manifest.type === "ok" ? widget.manifest.content : undefined;
  const defaults = {
    x: manifest?.x ?? HOST.x,
    y: manifest?.y ?? HOST.y,
    width: manifest?.width ?? HOST.width,
    height: manifest?.height ?? HOST.height,
    zIndex: manifest?.zIndex ?? HOST.zIndex,
    opacity: HOST.opacity,
    backgroundOpacity: HOST.backgroundOpacity,
  };
  const fullscreen = settings?.fullscreen ?? false;

  const resetSize = () => {
    const apply = () =>
      DeskulptWidgets.Commands.updateSettings(id, {
        width: defaults.width,
        height: defaults.height,
      });
    if (fullscreen) {
      void DeskulptWidgets.Commands.updateSettings(id, {
        fullscreen: false,
      }).then(apply);
      return;
    }
    void apply();
  };

  return (
    <Flex direction="column" gap="5">
      <SectionTable title={t("widgets.sharedSettings")} labelWidth="132px">
        <Table.Row align="center">
          <Table.RowHeaderCell>{t("widgets.position")}</Table.RowHeaderCell>
          <Table.Cell>
            <SettingCell
              reset={
                <ResetButton
                  disabled={
                    fullscreen ||
                    (settings?.x === defaults.x && settings?.y === defaults.y)
                  }
                  onClick={() =>
                    DeskulptWidgets.Commands.updateSettings(id, {
                      x: defaults.x,
                      y: defaults.y,
                    })
                  }
                />
              }
            >
              <Flex gap="1" align="center">
                <X id={id} />
                <LuX size={12} color="var(--gray-11)" />
                <Y id={id} />
              </Flex>
            </SettingCell>
          </Table.Cell>
        </Table.Row>
        <Table.Row align="center">
          <Table.RowHeaderCell>{t("widgets.size")}</Table.RowHeaderCell>
          <Table.Cell>
            <SettingCell
              reset={
                <ResetButton
                  disabled={
                    !fullscreen &&
                    settings?.width === defaults.width &&
                    settings?.height === defaults.height
                  }
                  onClick={resetSize}
                />
              }
            >
              <Flex gap="1" align="center">
                <Width id={id} />
                <LuX size={12} color="var(--gray-11)" />
                <Height id={id} />
                <Fullscreen id={id} />
              </Flex>
            </SettingCell>
          </Table.Cell>
        </Table.Row>
        <Table.Row align="center">
          <Table.RowHeaderCell>{t("widgets.zIndex")}</Table.RowHeaderCell>
          <Table.Cell>
            <SettingCell
              reset={
                <ResetButton
                  disabled={settings?.zIndex === defaults.zIndex}
                  onClick={() =>
                    DeskulptWidgets.Commands.updateSettings(id, {
                      zIndex: defaults.zIndex,
                    })
                  }
                />
              }
            >
              <ZIndex id={id} />
            </SettingCell>
          </Table.Cell>
        </Table.Row>
        <Table.Row align="center">
          <Table.RowHeaderCell>{t("widgets.opacity")}</Table.RowHeaderCell>
          <Table.Cell>
            <SettingCell
              reset={
                <ResetButton
                  disabled={settings?.opacity === defaults.opacity}
                  onClick={() =>
                    DeskulptWidgets.Commands.updateSettings(id, {
                      opacity: defaults.opacity,
                    })
                  }
                />
              }
            >
              <Opacity id={id} />
            </SettingCell>
          </Table.Cell>
        </Table.Row>
        <Table.Row align="center">
          <Table.RowHeaderCell>
            {t("widgets.backgroundOpacity")}
          </Table.RowHeaderCell>
          <Table.Cell>
            <SettingCell
              reset={
                <ResetButton
                  disabled={
                    settings?.backgroundOpacity === defaults.backgroundOpacity
                  }
                  onClick={() =>
                    DeskulptWidgets.Commands.updateSettings(id, {
                      backgroundOpacity: defaults.backgroundOpacity,
                    })
                  }
                />
              }
            >
              <BackgroundOpacity id={id} />
            </SettingCell>
          </Table.Cell>
        </Table.Row>
      </SectionTable>
      <OwnSettings id={id} />
    </Flex>
  );
};

export default Settings;
