import { useState, useEffect } from "react";

export const useStoreCurrency = () => {
  const [currencyCode, setCurrencyCode] = useState("KES");

  useEffect(() => {
    fetch("/admin/stores", { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        // Medusa V2 returns 'store' or 'stores' depending on the API
        const store = data.store || (data.stores && data.stores[0]);
        if (store) {
          if (store.default_currency_code) {
            setCurrencyCode(store.default_currency_code.toUpperCase());
          } else if (store.supported_currencies?.length > 0) {
            const defaultCurrency =
              store.supported_currencies.find((c: any) => c.is_default) ||
              store.supported_currencies[0];
            if (defaultCurrency?.currency_code) {
              setCurrencyCode(defaultCurrency.currency_code.toUpperCase());
            }
          }
        }
      })
      .catch((err) => {
        console.error("Failed to load store currency", err);
      });
  }, []);

  const formatCurrency = (amount: any) => {
    let numeric = 0;
    if (typeof amount === "object" && amount !== null && "value" in amount) {
      numeric = Number(amount.value);
    } else if (amount !== undefined && amount !== null) {
      numeric = Number(amount);
    }
    if (isNaN(numeric)) numeric = 0;

    return new Intl.NumberFormat(window.navigator.language || "en-US", {
      style: "currency",
      currency: currencyCode,
    }).format(numeric);
  };

  return { currencyCode, formatCurrency };
};
