import { Box, Button, DropdownMenu } from "@radix-ui/themes";
import { LuDownload } from "react-icons/lu";
import { DeskulptWidgets } from "@deskulpt/bindings";
import { useInstallWidget } from "../../hooks";
import { useTranslation } from "@deskulpt/utils";

interface WidgetPrimaryActionsProps {
  reference: DeskulptWidgets.RegistryWidgetReference;
  version: string;
}

const WidgetPrimaryActions = ({
  reference,
  version,
}: WidgetPrimaryActionsProps) => {
  const { t } = useTranslation();
  const { status, isInFlight, install, uninstall, upgrade } = useInstallWidget(
    reference,
    version,
  );

  return (
    <Box>
      {status === "not-installed" && (
        <Button
          size="1"
          variant="surface"
          loading={isInFlight}
          onClick={install}
        >
          <LuDownload /> {t("gallery.install")}
        </Button>
      )}

      {status === "installed" && (
        <Button
          size="1"
          variant="surface"
          loading={isInFlight}
          onClick={uninstall}
        >
          {t("gallery.uninstall")}
        </Button>
      )}

      {status === "upgrade-available" && (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <Button size="1" variant="surface" loading={isInFlight}>
              {t("gallery.upgrade")}
              <DropdownMenu.TriggerIcon />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content
            size="1"
            variant="soft"
            color="gray"
            align="end"
          >
            <DropdownMenu.Item disabled={isInFlight} onClick={upgrade}>
              {t("gallery.upgrade")}
            </DropdownMenu.Item>
            <DropdownMenu.Item disabled={isInFlight} onClick={uninstall}>
              {t("gallery.uninstall")}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      )}
    </Box>
  );
};

export default WidgetPrimaryActions;
