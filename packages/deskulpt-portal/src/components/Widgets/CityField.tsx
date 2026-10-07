import { Flex, Text } from "@radix-ui/themes";
import { useEffect, useState } from "react";
import { DeskulptWidgets } from "@deskulpt/bindings";
import { useTranslation } from "@deskulpt/utils";

type Place = {
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
};

const parseCity = (value: DeskulptWidgets.WidgetConfigValue | undefined) => {
  if (typeof value !== "string" || !value) return null;
  try {
    const data = JSON.parse(value) as Place;
    if (typeof data.name !== "string") return null;
    if (!Number.isFinite(data.latitude) || !Number.isFinite(data.longitude))
      return null;
    return data;
  } catch {
    return null;
  }
};

const placeLine = (place: Place) =>
  [place.name, place.admin1, place.country].filter(Boolean).join(" · ");

const locateCity = async (language: string): Promise<Place> => {
  const ipResponse = await fetch("https://ipinfo.io/ip", {
    signal: AbortSignal.timeout(12000),
  });
  if (!ipResponse.ok) throw new Error("ip");
  const ip = (await ipResponse.text()).trim();
  if (!ip) throw new Error("ip");
  const lang = language.startsWith("zh") ? "zh-CN" : "en";
  const geoResponse = await fetch(
    `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=${lang}&fields=status,message,city,regionName,country,lat,lon`,
    { signal: AbortSignal.timeout(12000) },
  );
  if (!geoResponse.ok) throw new Error("geo");
  const geo = (await geoResponse.json()) as {
    status?: string;
    city?: string;
    regionName?: string;
    country?: string;
    lat?: number;
    lon?: number;
  };
  if (
    geo.status !== "success" ||
    typeof geo.city !== "string" ||
    !geo.city ||
    !Number.isFinite(geo.lat) ||
    !Number.isFinite(geo.lon)
  )
    throw new Error("geo");
  return {
    name: geo.city,
    admin1: geo.regionName,
    country: geo.country,
    latitude: geo.lat as number,
    longitude: geo.lon as number,
  };
};

const CityField = ({
  id,
  settingKey,
  value,
  disabled,
}: {
  id: string;
  settingKey: string;
  value: DeskulptWidgets.WidgetConfigValue | undefined;
  disabled: boolean;
}) => {
  const { t, i18n } = useTranslation();
  const selected = parseCity(value);
  const [status, setStatus] = useState<"idle" | "loading" | "failed">(
    selected ? "idle" : "loading",
  );

  useEffect(() => {
    if (disabled || parseCity(value)) return;
    let cancel = false;
    setStatus("loading");
    locateCity(i18n.language)
      .then((place) => {
        if (cancel) return;
        return DeskulptWidgets.Commands.updateSettings(id, {
          config: {
            [settingKey]: JSON.stringify({
              name: place.name,
              admin1: place.admin1,
              country: place.country,
              latitude: place.latitude,
              longitude: place.longitude,
            }),
          },
        }).then(() => {
          if (!cancel) setStatus("idle");
        });
      })
      .catch(() => {
        if (!cancel) setStatus("failed");
      });
    return () => {
      cancel = true;
    };
  }, [disabled, i18n.language, id, settingKey, value]);

  return (
    <Flex direction="column" gap="1" minWidth="0">
      {selected ? <Text size="1">{placeLine(selected)}</Text> : null}
      {!selected && status === "loading" ? (
        <Text size="1" color="gray">
          {t("widgets.cityLocating")}
        </Text>
      ) : null}
      {status === "failed" ? (
        <Text size="1" color="gray">
          {t("widgets.cityFailed")}
        </Text>
      ) : null}
    </Flex>
  );
};

export default CityField;
