import { Switch } from "@radix-ui/themes";
import { DeskulptSettings } from "@deskulpt/bindings";
import { logger } from "@deskulpt/utils";
import { useSettingsStore } from "../../hooks";

const ShowGuides = () => {
  const showGuides = useSettingsStore((state) => state.showGuides ?? true);

  return (
    <Switch
      size="1"
      checked={showGuides}
      onCheckedChange={(checked) => {
        DeskulptSettings.Commands.update({ showGuides: checked }).catch(
          logger.error,
        );
      }}
    />
  );
};

export default ShowGuides;
