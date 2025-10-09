import { useForm } from "@mantine/form";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { enginesAtom } from "@/state/atoms";
import type { LocalEngine } from "@/utils/engines";
import EngineForm from "./EngineForm";

export default function EditEngine({ initialEngine }: { initialEngine: LocalEngine }) {
  const { t } = useTranslation();

  const [engines, setEngines] = useAtom(enginesAtom);
  const form = useForm<LocalEngine>({
    initialValues: initialEngine,

    validate: {
      name: (value) => {
        if (!value) return t("common.requireName");
        if (engines.find((e) => e.name === value && e !== initialEngine)) return t("common.nameAlreadyUsed");
      },
      path: (value) => {
        if (!value) return t("common.requirePath");
      },
    },
  });

  return (
    <EngineForm
      submitLabel={t("common.save")}
      form={form}
      onSubmit={(values) => {
        setEngines(async (prev) => (await prev).map((e) => (e === initialEngine ? values : e)));
      }}
    />
  );
}
