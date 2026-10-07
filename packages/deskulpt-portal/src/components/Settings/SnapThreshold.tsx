import { DeskulptSettings } from "@deskulpt/bindings";
import { logger } from "@deskulpt/utils";
import { useSettingsStore } from "../../hooks";
import IntegerInput from "../IntegerInput";

const SnapThreshold = () => {
  const snapThreshold = useSettingsStore((state) => state.snapThreshold ?? 8);

  return (
    <IntegerInput
      value={snapThreshold}
      min={0}
      max={64}
      style={{
        display: "block",
        width: "60px",
        marginLeft: "auto",
        textAlign: "right",
      }}
      onValueChange={(value: number) => {
        DeskulptSettings.Commands.update({ snapThreshold: value }).catch(
          logger.error,
        );
      }}
    />
  );
};

export default SnapThreshold;
