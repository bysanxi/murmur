import { Select } from "@radix-ui/themes";
import { DeskulptSettings } from "@deskulpt/bindings";
import { useSettingsStore } from "../../hooks";
import { logger, useTranslation } from "@deskulpt/utils";

const CanvasImode = () => {
  const { t } = useTranslation();
  const canvasImode = useSettingsStore((state) => state.canvasImode);
  const options: { value: DeskulptSettings.CanvasImode; label: string }[] = [
    { value: "auto", label: t("settings.imode.auto") },
    { value: "float", label: t("settings.imode.float") },
    { value: "sink", label: t("settings.imode.sink") },
  ];

  return (
    <Select.Root
      size="1"
      value={canvasImode}
      onValueChange={(value: DeskulptSettings.CanvasImode) => {
        DeskulptSettings.Commands.update({ canvasImode: value }).catch(
          logger.error,
        );
      }}
    >
      <Select.Trigger />
      <Select.Content>
        {options.map((option) => (
          <Select.Item key={option.value} value={option.value}>
            {option.label}
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  );
};

export default CanvasImode;
