import { Box, Flex, ScrollArea, Separator, Tabs, Text } from "@radix-ui/themes";
import {
  type PointerEvent as ReactPointerEvent,
  useRef,
  useState,
} from "react";
import { useWidgetsStore } from "../../hooks";
import { useShallow } from "zustand/shallow";
import Trigger from "./Trigger";
import GlobalActions from "./GlobalActions";
import Manifest from "./Manifest";
import Settings from "./Settings";
import { css } from "@emotion/react";
import { useTranslation } from "@deskulpt/utils";

const INFO_HEIGHT = 112;
const MIN_INFO = 88;
const MIN_SETTINGS = 140;

const styles = {
  tabList: css({ width: "25%", height: "100%", boxShadow: "none" }),
  tabContent: css({ boxShadow: "inset 1px 0 0 0 var(--gray-a5)" }),
  settingsScroll: css({
    "[data-radix-scroll-area-viewport] > div": { width: "100%" },
    // Table.Root 自带 ScrollArea。滑杆把表撑宽后，这条会和面板滚动条并排。
    ".rt-TableRoot .rt-ScrollAreaScrollbar": { display: "none" },
    ".rt-TableRoot [data-radix-scroll-area-viewport]": {
      overflow: "hidden !important",
    },
  }),
  splitter: css({
    flexShrink: 0,
    height: 9,
    margin: "2px 0",
    cursor: "row-resize",
    display: "flex",
    alignItems: "center",
    touchAction: "none",
    "&::before": {
      content: '""',
      height: 1,
      width: "100%",
      background: "var(--gray-a6)",
    },
    "&:hover::before, &:active::before": {
      height: 2,
      background: "var(--gray-8)",
    },
  }),
};

const WidgetsTab = () => {
  const { t } = useTranslation();
  const ids = useWidgetsStore(useShallow((state) => Object.keys(state)));
  const columnRef = useRef<HTMLDivElement>(null);
  const setColumn = (node: HTMLDivElement | null) => {
    if (node) columnRef.current = node;
  };
  const dragRef = useRef<{ y: number; height: number } | null>(null);
  const [infoHeight, setInfoHeight] = useState(INFO_HEIGHT);

  const onSplitterDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { y: event.clientY, height: infoHeight };
  };
  const onSplitterMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const column = columnRef.current;
    if (!drag || !column) return;
    const bounds = column.getBoundingClientRect();
    const max = Math.max(MIN_INFO, bounds.height - MIN_SETTINGS);
    const next = drag.height + (event.clientY - drag.y);
    setInfoHeight(Math.min(max, Math.max(MIN_INFO, next)));
  };
  const onSplitterUp = () => {
    dragRef.current = null;
  };

  return (
    <Tabs.Root orientation="vertical" defaultValue="tab0" asChild>
      <Flex height="100%">
        <Tabs.List css={styles.tabList}>
          <Flex direction="column" width="100%" gap="4">
            <ScrollArea scrollbars="vertical" type="hover" asChild>
              <Flex direction="column">
                {ids.map((id, index) => (
                  <Trigger key={id} id={id} value={`tab${index}`} />
                ))}
              </Flex>
            </ScrollArea>
            <Separator size="4" />
            <GlobalActions />
          </Flex>
        </Tabs.List>
        {ids.length === 0 ? (
          <Flex
            direction="column"
            align="center"
            justify="center"
            width="75%"
            css={styles.tabContent}
          >
            <Text size="2">{t("widgets.empty")}</Text>
          </Flex>
        ) : (
          ids.map((id, index) => (
            <Tabs.Content
              key={id}
              value={`tab${index}`}
              css={styles.tabContent}
              asChild
            >
              <Flex
                ref={setColumn}
                height="100%"
                direction="column"
                pl="2"
                width="75%"
              >
                <Box
                  height={`${infoHeight}px`}
                  minHeight="0"
                  overflow="hidden"
                  flexShrink="0"
                >
                  <Manifest id={id} />
                </Box>
                <Box
                  role="separator"
                  aria-orientation="horizontal"
                  aria-valuenow={infoHeight}
                  css={styles.splitter}
                  onPointerDown={onSplitterDown}
                  onPointerMove={onSplitterMove}
                  onPointerUp={onSplitterUp}
                />
                <Flex flexGrow="1" minHeight="0">
                  <ScrollArea
                    scrollbars="vertical"
                    type="hover"
                    css={styles.settingsScroll}
                  >
                    <Box pr="3" pb="4">
                      <Settings id={id} />
                    </Box>
                  </ScrollArea>
                </Flex>
              </Flex>
            </Tabs.Content>
          ))
        )}
      </Flex>
    </Tabs.Root>
  );
};

export default WidgetsTab;
