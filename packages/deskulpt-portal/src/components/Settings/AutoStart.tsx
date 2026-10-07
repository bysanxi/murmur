import { Spinner, Switch } from "@radix-ui/themes";
import { useEffect, useState } from "react";
import { DeskulptCore } from "@deskulpt/bindings";
import { logger } from "@deskulpt/utils";

const PLUGIN = "autostart";
const NO_WIDGET_ID = "";

function isEnabled() {
  return DeskulptCore.Commands.callPlugin(
    PLUGIN,
    "is_enabled",
    NO_WIDGET_ID,
    null,
  );
}

function apply(enabled: boolean) {
  return DeskulptCore.Commands.callPlugin(
    PLUGIN,
    enabled ? "enable" : "disable",
    NO_WIDGET_ID,
    null,
  );
}

/**
 * Launch at login lives outside Deskulpt (a Run key on Windows, a LaunchAgent
 * on macOS), so the state is read over IPC on mount instead of from
 * settings.json. Until that answers the switch stays disabled.
 */
const AutoStart = () => {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    isEnabled()
      .then((value) => {
        if (!cancelled) setEnabled(value === true);
      })
      .catch((error) => {
        logger.error(error);
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (enabled === null) {
    return <Spinner size="1" />;
  }

  return (
    <Switch
      size="1"
      checked={enabled}
      onCheckedChange={(checked) => {
        const previous = enabled;
        setEnabled(checked);
        apply(checked).catch((error) => {
          logger.error(error);
          setEnabled(previous);
        });
      }}
    />
  );
};

export default AutoStart;
