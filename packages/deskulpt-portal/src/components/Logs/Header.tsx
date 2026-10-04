import { DeskulptCore, DeskulptLogs } from "@deskulpt/bindings";
import { LOGGING_LEVELS, formatBytes, logger } from "@deskulpt/utils";
import { css } from "@emotion/react";
import { Button, Flex, Popover, Select, Text } from "@radix-ui/themes";
import { Dispatch, SetStateAction } from "react";
import { LuFolderOpen, LuRepeat, LuTrash } from "react-icons/lu";
import { toast } from "sonner";
import { useTranslation } from "@deskulpt/utils";

const styles = {
  minLevelSelect: css({
    width: "100px",
    textTransform: "capitalize",
  }),
  minLevelOption: css({
    textTransform: "capitalize",
  }),
};

interface HeaderProps {
  minLevel: DeskulptLogs.Level;
  setMinLevel: Dispatch<SetStateAction<DeskulptLogs.Level>>;
  refreshLogs: () => void;
}

const Header = ({ minLevel, setMinLevel, refreshLogs }: HeaderProps) => {
  const { t } = useTranslation();
  const clearLogs = () => {
    DeskulptLogs.Commands.clear()
      .then((bytes) => {
        toast.success(t("logs.cleaned", { size: formatBytes(bytes) }));
        refreshLogs();
      })
      .catch(logger.error);
  };

  return (
    <Flex align="center" gap="2" justify="between">
      <Select.Root
        size="1"
        value={minLevel}
        onValueChange={(value) => setMinLevel(value as DeskulptLogs.Level)}
      >
        <Select.Trigger css={styles.minLevelSelect} />
        <Select.Content position="popper">
          {LOGGING_LEVELS.map((level) => (
            <Select.Item key={level} value={level} css={styles.minLevelOption}>
              {level}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>

      <Flex align="center" justify="end" gap="2">
        <Button
          size="1"
          variant="surface"
          onClick={() => DeskulptCore.Commands.open("logs").catch(logger.error)}
        >
          <LuFolderOpen /> {t("actions.open")}
        </Button>
        <Button size="1" variant="surface" onClick={refreshLogs}>
          <LuRepeat /> {t("actions.refresh")}
        </Button>

        <Popover.Root>
          <Popover.Trigger>
            <Button size="1" variant="surface" color="ruby">
              <LuTrash /> {t("logs.clear")}
            </Button>
          </Popover.Trigger>
          <Popover.Content size="1" maxWidth="300px">
            <Flex direction="column" gap="3">
              <Text size="1">{t("logs.clearConfirm")}</Text>
              <Flex gap="2" justify="end">
                <Popover.Close>
                  <Button size="1" variant="soft">
                    {t("actions.cancel")}
                  </Button>
                </Popover.Close>
                <Popover.Close>
                  <Button
                    size="1"
                    variant="soft"
                    color="ruby"
                    onClick={clearLogs}
                  >
                    {t("actions.confirm")}
                  </Button>
                </Popover.Close>
              </Flex>
            </Flex>
          </Popover.Content>
        </Popover.Root>
      </Flex>
    </Flex>
  );
};

export default Header;
