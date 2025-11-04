import { Button, JsonInput, Modal, Space } from "@mantine/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { type Engine, engineSchema } from "@/utils/engines";

interface JSONModalProps {
  opened: boolean;
  toggleOpened: () => void;
  engine: Engine;
  setEngine: (v: Engine) => void;
}

export function JSONModal({ opened, toggleOpened, engine, setEngine }: JSONModalProps) {
  const { t } = useTranslation();

  const [value, setValue] = useState(JSON.stringify(engine, null, 2));
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal opened={opened} onClose={toggleOpened} title={t("features.engines.settings.editJSON")} size="xl">
      <JsonInput
        autosize
        value={value}
        onChange={(e) => {
          setValue(e);
          setError(null);
        }}
        error={error}
      />
      <Space h="md" />
      <Button
        onClick={() => {
          const parseRes = engineSchema.safeParse(JSON.parse(value));
          if (parseRes.success) {
            setEngine(parseRes.data);
            setError(null);
            toggleOpened();
          } else {
            setError(t("features.engines.invalidConfiguration"));
          }
        }}
      >
        {t("common.save")}
      </Button>
    </Modal>
  );
}
