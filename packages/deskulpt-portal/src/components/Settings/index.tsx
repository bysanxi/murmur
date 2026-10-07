import { Box, Button, Flex, ScrollArea, Table } from "@radix-ui/themes";
import { LuSquarePen } from "react-icons/lu";
import AutoStart from "./AutoStart";
import CanvasImode from "./CanvasImode";
import ShowGuides from "./ShowGuides";
import SnapThreshold from "./SnapThreshold";
import Shortcut from "./Shortcut";
import SectionTable from "./SectionTable";
import { DeskulptCore } from "@deskulpt/bindings";
import { logger, useTranslation } from "@deskulpt/utils";

const Settings = () => {
  const { t } = useTranslation();
  return (
    <Flex direction="column" gap="4" px="1" height="100%">
      <ScrollArea asChild>
        <Box height="380px">
          <Flex direction="column" gap="4">
            <SectionTable title={t("settings.basics")}>
              <Table.Row align="center">
                <Table.RowHeaderCell>
                  {t("settings.canvasImode")}
                </Table.RowHeaderCell>
                <Table.Cell justify="end">
                  <CanvasImode />
                </Table.Cell>
              </Table.Row>
              <Table.Row align="center">
                <Table.RowHeaderCell>
                  {t("settings.snapThreshold")}
                </Table.RowHeaderCell>
                <Table.Cell justify="end">
                  <SnapThreshold />
                </Table.Cell>
              </Table.Row>
              <Table.Row align="center">
                <Table.RowHeaderCell>
                  {t("settings.showGuides")}
                </Table.RowHeaderCell>
                <Table.Cell justify="end">
                  <ShowGuides />
                </Table.Cell>
              </Table.Row>
              <Table.Row align="center">
                <Table.RowHeaderCell>
                  {t("settings.launchAtLogin")}
                </Table.RowHeaderCell>
                <Table.Cell justify="end">
                  <AutoStart />
                </Table.Cell>
              </Table.Row>
            </SectionTable>
            <SectionTable title={t("settings.shortcuts")}>
              <Table.Row align="center">
                <Table.RowHeaderCell>
                  {t("settings.toggleCanvasImode")}
                </Table.RowHeaderCell>
                <Table.Cell>
                  <Shortcut action="toggleCanvasImode" />
                </Table.Cell>
              </Table.Row>
              <Table.Row align="center">
                <Table.RowHeaderCell>
                  {t("settings.openManager")}
                </Table.RowHeaderCell>
                <Table.Cell>
                  <Shortcut action="openPortal" />
                </Table.Cell>
              </Table.Row>
            </SectionTable>
          </Flex>
        </Box>
      </ScrollArea>

      <Button
        size="2"
        variant="soft"
        color="gray"
        onClick={() => {
          DeskulptCore.Commands.open("settings").catch(logger.error);
        }}
      >
        <LuSquarePen /> {t("settings.editSettingsJson")}
      </Button>
    </Flex>
  );
};

export default Settings;
