import { css } from "@emotion/react";
import { Box, Code, Dialog, ScrollArea, Text } from "@radix-ui/themes";
import { useTranslation } from "@deskulpt/utils";

const styles = {
  trigger: css({ cursor: "pointer" }),
};

interface ErrorDisplayProps {
  id: string;
  error: string;
  message: string;
}

const ErrorDisplay = ({ id, error, message }: ErrorDisplayProps) => {
  const { t } = useTranslation();
  return (
    <Dialog.Root>
      <Dialog.Trigger>
        <Box width="100%" height="100%" p="2" css={styles.trigger} asChild>
          <Text size="2" as="div" color="red">
            {t("canvas.widgetError", { id })}
            <br />
            {error}
            <br />
            {message}
          </Text>
        </Box>
      </Dialog.Trigger>
      <Dialog.Content size="1" maxWidth="60vw">
        <Dialog.Title size="3" color="red" mt="2" mb="1">
          {t("canvas.widgetErrorTitle", { id })}
        </Dialog.Title>
        <Dialog.Description size="2" color="red" mb="4">
          {error}
        </Dialog.Description>
        <ScrollArea asChild>
          <Box px="3" pb="3" maxHeight="50vh">
            <Box asChild m="0">
              <pre>
                <Code size="2" variant="ghost">
                  {message}
                </Code>
              </pre>
            </Box>
          </Box>
        </ScrollArea>
      </Dialog.Content>
    </Dialog.Root>
  );
};

export default ErrorDisplay;
