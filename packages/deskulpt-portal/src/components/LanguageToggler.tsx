import { DropdownMenu, IconButton } from "@radix-ui/themes";
import { LuLanguages } from "react-icons/lu";
import { DeskulptSettings } from "@deskulpt/bindings";
import {
  LANGUAGES,
  type Language,
  changeLanguage,
  logger,
  useTranslation,
} from "@deskulpt/utils";

const LanguageToggler = () => {
  const { t, i18n } = useTranslation();
  const current = i18n.language as Language;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <IconButton size="1" variant="soft" title={t("actions.switchLanguage")}>
          <LuLanguages />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content size="1" align="end">
        {LANGUAGES.map((language) => (
          <DropdownMenu.Item
            key={language}
            onSelect={() => {
              changeLanguage(language);
              DeskulptSettings.Commands.update({ language }).catch(
                logger.error,
              );
            }}
          >
            {language === current ? "✓ " : ""}
            {t(`language.${language}`)}
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
};

export default LanguageToggler;
