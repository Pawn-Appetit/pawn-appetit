import { Text } from "@mantine/core";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

function NoDatabaseWarning() {
  const { t } = useTranslation();

  return (
    <>
      <Text>{t("features.board.database.noReference1")}</Text>
      <Text>
        {t("features.board.database.noReference2")} <Link to="/databases">{t("features.board.database.selectReference")}</Link>{" "}
        {t("features.board.database.noReference3")}
      </Text>
    </>
  );
}

export default NoDatabaseWarning;
