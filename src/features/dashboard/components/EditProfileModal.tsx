import { Alert, Button, Group, Modal, Stack, TextInput } from "@mantine/core";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { fetchFidePlayer, type FidePlayer } from "@/utils/fide";

interface EditProfileModalProps {
  opened: boolean;
  onClose: () => void;
  onSave: (fideId: string, fidePlayer: { 
    name: string; 
    firstName: string; 
    gender: "male" | "female";
    title?: string;
    standardRating?: number;
    rapidRating?: number;
    blitzRating?: number;
    worldRank?: number;
    nationalRank?: number;
    photo?: string;
  } | null, displayName?: string) => void;
  currentFideId?: string;
  currentDisplayName?: string;
}

export function EditProfileModal({ opened, onClose, onSave, currentFideId, currentDisplayName }: EditProfileModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [fidePlayer, setFidePlayer] = useState<FidePlayer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fideIdValue, setFideIdValue] = useState("");
  const [customName, setCustomName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Limpiar el valor para que solo contenga números
  const cleanFideId = useCallback((value: string): string => {
    return value.replace(/\D/g, "");
  }, []);

  // Manejar cambios en el input (escribir o pegar)
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.currentTarget.value;
    const cleanedValue = cleanFideId(rawValue);
    setFideIdValue(cleanedValue);
    setError(null);
  }, [cleanFideId]);

  // Handler adicional para capturar cambios que onChange podría perder (especialmente después de pegar)
  const handleInput = useCallback((e: React.FormEvent<HTMLInputElement>) => {
    const rawValue = e.currentTarget.value;
    const cleanedValue = cleanFideId(rawValue);
    // Solo actualizar si el valor es diferente para evitar loops infinitos
    if (cleanedValue !== fideIdValue) {
      setFideIdValue(cleanedValue);
      setError(null);
    }
  }, [cleanFideId, fideIdValue]);

  // Manejar pegado - prevenir el comportamiento por defecto e insertar el valor limpio
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    const pastedText = e.clipboardData.getData("text");
    const cleanedValue = cleanFideId(pastedText);
    
    // Actualizar el estado inmediatamente - esto debería causar un re-render
    // y habilitar el botón automáticamente
    setFideIdValue(cleanedValue);
    setError(null);
  }, [cleanFideId]);

  // Validar FIDE ID
  const validateFideId = useCallback((fideId: string): string | null => {
    if (!fideId.trim()) {
      return null; // FIDE ID es opcional
    }
    if (!/^\d+$/.test(fideId)) {
      return t("features.dashboard.editProfile.invalidFideId");
    }
    return null;
  }, [t]);

  // Buscar jugador FIDE
  const handleSearch = useCallback(async () => {
    const fideId = fideIdValue.trim();
    
    // Validar formato
    const validationError = validateFideId(fideId);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!fideId) {
      setError(t("features.dashboard.editProfile.enterFideId"));
      return;
    }

    setLoading(true);
    setError(null);
    setFidePlayer(null);

    try {
      console.log("Searching for FIDE ID:", fideId);
      const player = await fetchFidePlayer(fideId);
      console.log("Fetched FIDE player:", player);
      
      if (player) {
        console.log("Player ratings:", {
          standard: player.standardRating ?? player.rating,
          rapid: player.rapidRating,
          blitz: player.blitzRating,
        });
        setFidePlayer(player);
      } else {
        setError(t("features.dashboard.editProfile.playerNotFound"));
      }
    } catch (err) {
      console.error("Error fetching FIDE player:", err);
      setError(t("features.dashboard.editProfile.searchError"));
    } finally {
      setLoading(false);
    }
  }, [fideIdValue, validateFideId, t]);

  // Guardar perfil
  const handleSave = useCallback(() => {
    const fideId = fideIdValue.trim();
    const finalDisplayName = customName.trim();
    
    console.log("handleSave - fidePlayer:", fidePlayer);
    console.log("handleSave - customName:", customName);
    console.log("handleSave - finalDisplayName:", finalDisplayName);
    console.log("handleSave - fideId:", fideId);

    // Siempre guardar el displayName, incluso si no hay FIDE ID o FIDE player
    if (fidePlayer && fideId) {
      // Si hay FIDE player, guardar ambos
      const playerData = {
        name: fidePlayer.name,
        firstName: fidePlayer.firstName, // Mantener firstName original de FIDE
        gender: fidePlayer.gender,
        title: fidePlayer.title,
        standardRating: fidePlayer.standardRating ?? fidePlayer.rating,
        rapidRating: fidePlayer.rapidRating,
        blitzRating: fidePlayer.blitzRating,
        worldRank: fidePlayer.worldRank,
        nationalRank: fidePlayer.nationalRank,
        photo: fidePlayer.photo,
      };
      console.log("handleSave - saving playerData:", playerData);
      onSave(fideId, playerData, finalDisplayName);
    } else if (fideId) {
      // Si solo hay FIDE ID pero no player (búsqueda fallida o no realizada), guardar solo el ID
      onSave(fideId, null, finalDisplayName);
    } else {
      // Si no hay FIDE ID, solo guardar el displayName
      onSave("", null, finalDisplayName);
    }
    
    // Resetear estado al cerrar
    handleClose();
  }, [fideIdValue, fidePlayer, customName, onSave, t]);

  // Cerrar modal y resetear estado
  const handleClose = useCallback(() => {
    onClose();
    setFideIdValue(currentFideId || "");
    setFidePlayer(null);
    setError(null);
  }, [onClose, currentFideId]);

  // Sincronizar cuando se abre el modal o cambia currentFideId
  useEffect(() => {
    if (opened) {
      const initialValue = currentFideId || "";
      setFideIdValue(initialValue);
      setFidePlayer(null);
      setCustomName(currentDisplayName || "");
      setError(null);
    }
  }, [opened, currentFideId, currentDisplayName]);

  // Habilitar botón de búsqueda si hay un valor válido
  // Usar useMemo para asegurar que se recalcule cuando cambie fideIdValue
  const canSearch = useMemo(() => {
    return fideIdValue.trim().length > 0 && !loading;
  }, [fideIdValue, loading]);
  
  const canSave = useMemo(() => {
    // Permitir guardar si hay displayName o FIDE ID
    return (customName.trim().length > 0 || fideIdValue.trim().length > 0) && !loading;
  }, [customName, fideIdValue, loading]);

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={t("features.dashboard.editProfile.title")}
      size="md"
    >
      <Stack gap="md">
        <TextInput
          label={t("features.dashboard.editProfile.customName")}
          placeholder={t("features.dashboard.editProfile.customNamePlaceholder")}
          description={t("features.dashboard.editProfile.customNameDescription")}
          value={customName}
          onChange={(e) => setCustomName(e.currentTarget.value)}
        />
        
        <TextInput
          ref={inputRef}
          label={t("features.dashboard.editProfile.fideIdLabel")}
          placeholder={t("features.dashboard.editProfile.fideIdPlaceholder")}
          value={fideIdValue}
          onChange={handleInputChange}
          onInput={handleInput}
          onPaste={handlePaste}
          error={error && !loading ? error : validateFideId(fideIdValue)}
          disabled={loading}
        />
        
        {error && loading === false && (
          <Alert color="red" title={t("features.dashboard.editProfile.error")}>
            {error}
          </Alert>
        )}

        {fidePlayer && (
          <Stack gap="xs">
            <TextInput
              label={t("features.dashboard.editProfile.name")}
              value={fidePlayer.name}
              disabled
            />
            {fidePlayer.title && (
              <TextInput
                label={t("features.dashboard.editProfile.title")}
                value={fidePlayer.title}
                disabled
              />
            )}
            <TextInput
              label={t("features.dashboard.editProfile.gender")}
              value={fidePlayer.gender === "male" ? t("features.dashboard.editProfile.male") : t("features.dashboard.editProfile.female")}
              disabled
            />
            {fidePlayer.standardRating && (
              <TextInput
                label={`${t("features.dashboard.editProfile.standard")} Rating`}
                value={fidePlayer.standardRating.toString()}
                disabled
              />
            )}
            {fidePlayer.rapidRating && (
              <TextInput
                label={`${t("features.dashboard.editProfile.rapid")} Rating`}
                value={fidePlayer.rapidRating.toString()}
                disabled
              />
            )}
            {fidePlayer.blitzRating && (
              <TextInput
                label={`${t("features.dashboard.editProfile.blitz")} Rating`}
                value={fidePlayer.blitzRating.toString()}
                disabled
              />
            )}
          </Stack>
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="subtle" onClick={handleClose} disabled={loading}>
            {t("common.cancel")}
          </Button>
          <Button 
            onClick={handleSearch} 
            loading={loading} 
            disabled={!canSearch}
          >
            {t("features.dashboard.editProfile.search")}
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!canSave}
            variant={fidePlayer ? "filled" : "light"}
          >
            {t("common.save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
