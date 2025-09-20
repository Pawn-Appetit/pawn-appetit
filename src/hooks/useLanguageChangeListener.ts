import { useEffect } from "react";

/**
 * Hook that forces a component to re-render when the language/date format changes.
 * This is useful for DataTable components that need to update their render functions
 * when the date format setting changes.
 *
 * @param forceUpdate - The forceUpdate function from useForceUpdate hook
 */
export function useLanguageChangeListener(forceUpdate: () => void) {
  useEffect(() => {
    const handleLanguageChange = () => {
      forceUpdate();
    };

    window.addEventListener("languageChanged", handleLanguageChange);
    return () => window.removeEventListener("languageChanged", handleLanguageChange);
  }, [forceUpdate]);
}
