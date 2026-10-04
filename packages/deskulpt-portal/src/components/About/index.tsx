import { Avatar, Box, Flex, Heading, Table } from "@radix-ui/themes";
import CopyLink from "../CopyLink";
import { SiGithub } from "react-icons/si";
import { css } from "@emotion/react";
import { useTranslation } from "@deskulpt/utils";

const styles = {
  logo: css({
    ".dark &": {
      filter: "invert(90%) hue-rotate(170deg)",
      opacity: 0.9,
    },
  }),
  table: css({
    "--table-cell-padding": "var(--space-1) 0",
    "--table-cell-min-height": 0,
    "& tr": { "--table-row-box-shadow": "none" },
    "& th": { color: "var(--gray-11)", width: "100px" },
  }),
};

const AboutTab = () => {
  const { t } = useTranslation();
  return (
    <Flex height="100%" pb="8" justify="center" align="center">
      <Flex align="center" justify="center" flexGrow="1">
        <Avatar src="/deskulpt.svg" fallback="D" size="8" css={styles.logo} />
      </Flex>
      <Box flexGrow="1">
        <Heading size="6" mb="1">
          {t("about.name")}
        </Heading>
        <Heading size="3" mb="4" weight="regular" color="gray">
          {t("about.tagline")}
        </Heading>
        <Table.Root size="1" css={styles.table}>
          <Table.Body>
            <Table.Row align="center">
              <Table.RowHeaderCell>{t("about.version")}</Table.RowHeaderCell>
              <Table.Cell>{__VERSION__}</Table.Cell>
            </Table.Row>
            <Table.Row align="center">
              <Table.RowHeaderCell>{t("about.authors")}</Table.RowHeaderCell>
              <Table.Cell>{t("about.author")}</Table.Cell>
            </Table.Row>
            <Table.Row align="center">
              <Table.RowHeaderCell>{t("about.repository")}</Table.RowHeaderCell>
              <Table.Cell>
                <CopyLink href="https://github.com/bysanxi/murmur">
                  <Flex align="center" gap="1">
                    <SiGithub /> bysanxi/murmur
                  </Flex>
                </CopyLink>
              </Table.Cell>
            </Table.Row>
            <Table.Row align="center">
              <Table.RowHeaderCell>{t("about.homepage")}</Table.RowHeaderCell>
              <Table.Cell>
                <CopyLink href="https://murmur.yoga">murmur.yoga</CopyLink>
              </Table.Cell>
            </Table.Row>
          </Table.Body>
        </Table.Root>
      </Box>
    </Flex>
  );
};

export default AboutTab;
