import { Alert, Button, Group, Modal, Stack, TextInput } from "@mantine/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { type FidePlayer, fetchFidePlayer } from "@/utils/fide";

interface EditProfileModalProps {
  opened: boolean;
  onClose: () => void;
  onSave: (
    fideId: string,
    fidePlayer: {
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
    } | null,
    displayName?: string,
    lichessToken?: string,
  ) => void;
  currentFideId?: string;
  currentDisplayName?: string;
  currentLichessToken?: string;
}

export function EditProfileModal({
  opened,
  onClose,
  onSave,
  currentFideId,
  currentDisplayName,
  currentLichessToken,
}: EditProfileModalProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [fidePlayer, setFidePlayer] = useState<FidePlayer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fideIdValue, setFideIdValue] = useState("");
  const [customName, setCustomName] = useState("");
  const [lichessToken, setLichessToken] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const lichessTokenInputRef = useRef<HTMLInputElement>(null);

  // Clean the value so it only contains numbers
  const cleanFideId = useCallback((value: string): string => {
    return value.replace(/\D/g, "");
  }, []);

  // Handle input changes (typing or pasting) for FIDE ID
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.currentTarget.value;
      const cleanedValue = cleanFideId(rawValue);
      setFideIdValue(cleanedValue);
      setError(null);
    },
    [cleanFideId],
  );

  // Additional handler to capture changes that onChange might miss (especially after pasting) for FIDE ID
  const handleInput = useCallback(
    (e: React.FormEvent<HTMLInputElement>) => {
      const rawValue = e.currentTarget.value;
      const cleanedValue = cleanFideId(rawValue);
      // Only update if the value is different to avoid infinite loops
      if (cleanedValue !== fideIdValue) {
        setFideIdValue(cleanedValue);
        setError(null);
      }
    },
    [cleanFideId, fideIdValue],
  );

  // Handle paste - prevent default behavior and insert the cleaned value for FIDE ID
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const pastedText = e.clipboardData.getData("text");
      const cleanedValue = cleanFideId(pastedText);

      // Update state immediately - this should cause a re-render
      // and enable the button automatically
      setFideIdValue(cleanedValue);
      setError(null);
    },
    [cleanFideId],
  );

  // Handle input changes (typing or pasting) for Lichess Token
  const handleLichessTokenInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = e.currentTarget.value;
      setLichessToken(rawValue);
    },
    [],
  );

  // Additional handler to capture changes that onChange might miss (especially after pasting) for Lichess Token
  const handleLichessTokenInput = useCallback(
    (e: React.FormEvent<HTMLInputElement>) => {
      const rawValue = e.currentTarget.value;
      // Only update if the value is different to avoid infinite loops
      if (rawValue !== lichessToken) {
        setLichessToken(rawValue);
      }
    },
    [lichessToken],
  );

  // Handle paste - prevent default behavior and insert the value for Lichess Token
  const handleLichessTokenPaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const pastedText = e.clipboardData.getData("text");

      // Update state immediately - this should cause a re-render
      setLichessToken(pastedText);
    },
    [],
  );

  // Validate FIDE ID
  const validateFideId = useCallback(
    (fideId: string): string | null => {
      if (!fideId.trim()) {
        return null; // FIDE ID is optional
      }
      if (!/^\d+$/.test(fideId)) {
        return t("features.dashboard.editProfile.invalidFideId");
      }
      return null;
    },
    [t],
  );

  // Search for FIDE player
  const handleSearch = useCallback(async () => {
    const fideId = fideIdValue.trim();

    // Validate format
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
      const player = await fetchFidePlayer(fideId);

      if (player) {
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

  // Save profile
  const handleSave = useCallback(() => {
    const fideId = fideIdValue.trim();
    const finalDisplayName = customName.trim();
    const finalLichessToken = lichessToken.trim();

    // Always save the displayName, even if there's no FIDE ID or FIDE player
    if (fidePlayer && fideId) {
      // If there's a FIDE player, save both
      const playerData = {
        name: fidePlayer.name,
        firstName: fidePlayer.firstName, // Keep original firstName from FIDE
        gender: fidePlayer.gender,
        title: fidePlayer.title,
        standardRating: fidePlayer.standardRating ?? fidePlayer.rating,
        rapidRating: fidePlayer.rapidRating,
        blitzRating: fidePlayer.blitzRating,
        worldRank: fidePlayer.worldRank,
        nationalRank: fidePlayer.nationalRank,
        photo: fidePlayer.photo,
      };
      onSave(fideId, playerData, finalDisplayName, finalLichessToken || undefined);
    } else if (fideId) {
      // If there's only a FIDE ID but no player (failed or not performed search), save only the ID
      onSave(fideId, null, finalDisplayName, finalLichessToken || undefined);
    } else {
      // If there's no FIDE ID, only save the displayName
      onSave("", null, finalDisplayName, finalLichessToken || undefined);
    }

    // Reset state when closing
    handleClose();
  }, [fideIdValue, fidePlayer, customName, lichessToken, onSave, t]);

  // Close modal and reset state
  const handleClose = useCallback(() => {
    onClose();
    setFideIdValue(currentFideId || "");
    setFidePlayer(null);
    setError(null);
    setLichessToken(currentLichessToken || "");
  }, [onClose, currentFideId, currentLichessToken]);

  // Synchronize when the modal opens or currentFideId changes
  useEffect(() => {
    if (opened) {
      const initialValue = currentFideId || "";
      setFideIdValue(initialValue);
      setFidePlayer(null);
      setCustomName(currentDisplayName || "");
      setLichessToken(currentLichessToken || "");
      setError(null);
    }
  }, [opened, currentFideId, currentDisplayName, currentLichessToken]);

  // Enable search button if there's a valid value
  // Use useMemo to ensure it recalculates when fideIdValue changes
  const canSearch = useMemo(() => {
    return fideIdValue.trim().length > 0 && !loading;
  }, [fideIdValue, loading]);

  const canSave = useMemo(() => {
    // Allow saving if there's a displayName or FIDE ID
    return (customName.trim().length > 0 || fideIdValue.trim().length > 0) && !loading;
  }, [customName, fideIdValue, loading]);

  return (
    <Modal opened={opened} onClose={handleClose} title={t("features.dashboard.editProfile.title")} size="md">
      <Stack gap="md">
        <TextInput
          label={t("features.dashboard.editProfile.customName")}
          placeholder={t("features.dashboard.editProfile.customNamePlaceholder")}
          description={t("features.dashboard.editProfile.customNameDescription")}
          value={customName}
          onChange={(e) => setCustomName(e.currentTarget.value)}
        />

        <TextInput
          ref={lichessTokenInputRef}
          label={t("features.dashboard.editProfile.lichessToken")}
          placeholder={t("features.dashboard.editProfile.lichessTokenPlaceholder")}
          description={t("features.dashboard.editProfile.lichessTokenDescription")}
          value={lichessToken}
          onChange={handleLichessTokenInputChange}
          onInput={handleLichessTokenInput}
          onPaste={handleLichessTokenPaste}
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
            <TextInput label={t("features.dashboard.editProfile.name")} value={fidePlayer.name} disabled />
            {fidePlayer.title && (
              <TextInput label={t("features.dashboard.editProfile.title")} value={fidePlayer.title} disabled />
            )}
            <TextInput
              label={t("features.dashboard.editProfile.gender")}
              value={
                fidePlayer.gender === "male"
                  ? t("features.dashboard.editProfile.male")
                  : t("features.dashboard.editProfile.female")
              }
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
          <Button onClick={handleSearch} loading={loading} disabled={!canSearch}>
            {t("features.dashboard.editProfile.search")}
          </Button>
          <Button onClick={handleSave} disabled={!canSave} variant={fidePlayer ? "filled" : "light"}>
            {t("common.save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
