import { Flex, IconButton } from "@radix-ui/themes";
import { LuFolderOpen, LuRepeat } from "react-icons/lu";
import { DeskulptCore, DeskulptWidgets } from "@deskulpt/bindings";
import { logger, useTranslation } from "@deskulpt/utils";

const GlobalActions = () => {
  const { t } = useTranslation();
  return (
    <Flex gap="6" align="center" justify="center" pb="2" pr="4">
      <IconButton
        title={t("widgets.refreshAll")}
        size="1"
        variant="ghost"
        onClick={() =>
          DeskulptWidgets.Commands.refreshAll().catch(logger.error)
        }
      >
        <LuRepeat size={16} />
      </IconButton>
      <IconButton
        title={t("widgets.openWidgetsDir")}
        size="1"
        variant="ghost"
        onClick={() =>
          DeskulptCore.Commands.open("widgets").catch(logger.error)
        }
      >
        <LuFolderOpen size="16" />
      </IconButton>
    </Flex>
  );
};

export default GlobalActions;
