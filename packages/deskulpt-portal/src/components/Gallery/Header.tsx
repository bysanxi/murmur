import { css } from "@emotion/react";
import { Button, Flex, Select } from "@radix-ui/themes";
import { LuRepeat } from "react-icons/lu";
import { useTranslation } from "@deskulpt/utils";

const styles = {
  select: css({ width: "100px" }),
};

interface HeaderProps {
  refresh: () => void;
}

const Header = ({ refresh }: HeaderProps) => {
  const { t } = useTranslation();
  return (
    <Flex align="center" gap="2" justify="between">
      <Select.Root size="1" defaultValue="widgets">
        <Select.Trigger css={styles.select} />
        <Select.Content position="popper">
          <Select.Item value="widgets">{t("gallery.widgets")}</Select.Item>
        </Select.Content>
      </Select.Root>

      <Flex align="center" justify="end" gap="2">
        <Button size="1" variant="surface" onClick={refresh}>
          <LuRepeat /> {t("actions.refresh")}
        </Button>
      </Flex>
    </Flex>
  );
};

export default Header;
