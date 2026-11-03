import { useEffect, useId, useMemo, useRef, useState } from "react";

const normalizeSearchText = (value) => String(value ?? "")
  .toLocaleLowerCase()
  .normalize("NFKD")
  .replace(/[\u064B-\u065F\u0670]/g, "")
  .replace(/[أإآ]/g, "ا")
  .replace(/ى/g, "ي")
  .replace(/ة/g, "ه")
  .replace(/[ؤئ]/g, "ء");

export default function SearchableInput({
  label,
  options = [],
  value,
  onChange,
  placeholder = "Select…",
  disabled = false,
  loading = false,
  noOptionsMessage = "No matching options"
}) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const inputId = useId();
  const listboxId = `${inputId}-listbox`;
  const hintId = `${inputId}-hint`;

  const filteredOptions = useMemo(() => {
    const normalizedQuery = normalizeSearchText(query);
    return options.filter((option) => normalizeSearchText(option).includes(normalizedQuery));
  }, [options, query]);

  const closeMenu = () => {
    setIsOpen(false);
    setQuery("");
    setActiveIndex(-1);
  };

  const openMenu = (index) => {
    if (disabled || loading) return;
    setIsOpen(true);
    setQuery("");
    setActiveIndex(typeof index === "number" ? index : (options.length ? 0 : -1));
  };

  useEffect(() => {
    setActiveIndex((current) => {
      if (!filteredOptions.length) return -1;
      return Math.min(Math.max(current, 0), filteredOptions.length - 1);
    });
  }, [filteredOptions.length]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) closeMenu();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  const selectOption = (option) => {
    onChange(option);
    closeMenu();
    inputRef.current?.focus();
  };

  const handleKeyDown = (event) => {
    if (disabled || loading) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!isOpen) openMenu(0);
      else setActiveIndex((index) => Math.min(index + 1, filteredOptions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) openMenu(Math.max(filteredOptions.length - 1, 0));
      else setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Home" && isOpen) {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === "End" && isOpen) {
      event.preventDefault();
      setActiveIndex(Math.max(filteredOptions.length - 1, 0));
    } else if (event.key === "Enter" && isOpen && activeIndex >= 0) {
      event.preventDefault();
      selectOption(filteredOptions[activeIndex]);
    } else if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      closeMenu();
    } else if (event.key === "Tab") {
      closeMenu();
    }
  };

  const visibleValue = isOpen ? query : (value ?? "");
  const statusText = loading
    ? "Loading options"
    : isOpen
      ? `${filteredOptions.length} option${filteredOptions.length === 1 ? "" : "s"} available. Use arrow keys to choose.`
      : "";

  return (
    <div className="searchable-input" ref={wrapperRef}>
      {label && <label htmlFor={inputId} className="searchable-input__label">{label}</label>}
      <div className="searchable-input__control">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          value={visibleValue}
          onChange={(event) => {
            if (!isOpen) openMenu();
            setQuery(event.target.value);
          }}
          onFocus={() => !isOpen && openMenu()}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={isOpen}
          aria-activedescendant={isOpen && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          aria-describedby={statusText ? hintId : undefined}
          className="searchable-input__field"
        />
        {loading ? (
          <span className="searchable-input__spinner" role="status" aria-label="Loading options" />
        ) : (
          <button
            type="button"
            onClick={() => isOpen ? closeMenu() : openMenu()}
            className="searchable-input__toggle"
            disabled={disabled}
            aria-label={isOpen ? `Close ${label || "options"}` : `Open ${label || "options"}`}
            aria-expanded={isOpen}
            aria-controls={listboxId}
          >
            <span aria-hidden="true">⌄</span>
          </button>
        )}
      </div>
      <span id={hintId} className="sr-only" aria-live="polite">{statusText}</span>
      {isOpen && !disabled && (
        <ul id={listboxId} role="listbox" aria-label={label || placeholder} aria-busy={loading} className="searchable-input__menu">
          {loading ? (
            <li className="searchable-input__empty" role="option" aria-disabled="true">Loading options…</li>
          ) : filteredOptions.length ? filteredOptions.map((option, index) => (
            <li
              key={`${String(option)}-${index}`}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={value === option}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => selectOption(option)}
              onPointerMove={() => setActiveIndex(index)}
              className={`searchable-input__option ${activeIndex === index ? "is-active" : ""} ${value === option ? "is-selected" : ""}`}
            >
              {String(option)}
            </li>
          )) : (
            <li className="searchable-input__empty" role="option" aria-disabled="true">{noOptionsMessage}</li>
          )}
        </ul>
      )}
    </div>
  );
}
