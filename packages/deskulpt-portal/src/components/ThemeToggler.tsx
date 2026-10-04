import { IconButton } from "@radix-ui/themes";
import { DeskulptSettings } from "@deskulpt/bindings";
import { LuMoon, LuSun } from "react-icons/lu";
import { logger, useTranslation } from "@deskulpt/utils";

interface ThemeTogglerProps {
  theme: DeskulptSettings.Theme;
}

const ThemeToggler = ({ theme }: ThemeTogglerProps) => {
  const { t } = useTranslation();
  return (
    <IconButton
      title={t("actions.toggleTheme")}
      variant="soft"
      size="1"
      onClick={() => {
        DeskulptSettings.Commands.update({
          theme: theme === "light" ? "dark" : "light",
        }).catch(logger.error);
      }}
    >
      {theme === "light" ? <LuSun /> : <LuMoon />}
    </IconButton>
  );
};

export default ThemeToggler;
