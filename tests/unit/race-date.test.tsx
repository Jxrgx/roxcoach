import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { hasErrors, raceDateRuleError, validateAthleteProfile, validateSportsInfo } from "@/lib/validations";
import { RaceCountdown } from "@/components/athlete/race-countdown";

const TODAY = "2026-11-25";
const sports = { division: "Pro Men", raceDate: "", availableDays: ["Lun"], equipment: ["Trineo"] };

describe("fecha de competencia opcional", () => {
  it("sin fecha es válido (crear y editar)", () => {
    expect(raceDateRuleError("", "", TODAY)).toBeUndefined();
    expect(raceDateRuleError("", "2027-03-01", TODAY)).toBeUndefined(); // borrar una fecha guardada
    expect(hasErrors(validateSportsInfo(sports, { today: TODAY, savedRaceDate: "" }))).toBe(false);
    expect(
      hasErrors(validateAthleteProfile({ ...sports, name: "Ana Pérez", weightUnit: "kg" }, { today: TODAY, savedRaceDate: "" })),
    ).toBe(false);
  });

  it("una fecha capturada debe ser hoy o posterior", () => {
    expect(raceDateRuleError(TODAY, "", TODAY)).toBeUndefined();
    expect(raceDateRuleError("2027-01-08", "", TODAY)).toBeUndefined();
    expect(raceDateRuleError("2026-11-24", "", TODAY)).toBe("La fecha de competencia debe ser hoy o posterior.");
    expect(validateSportsInfo({ ...sports, raceDate: "2026-01-01" }, { today: TODAY, savedRaceDate: "" }).raceDate).toBe(
      "La fecha de competencia debe ser hoy o posterior.",
    );
  });

  it("cambiar a otra fecha pasada se rechaza; conservar la ya guardada no", () => {
    expect(raceDateRuleError("2026-06-01", "2026-06-01", TODAY)).toBeUndefined();
    expect(raceDateRuleError("2026-05-01", "2026-06-01", TODAY)).toBe("La fecha de competencia debe ser hoy o posterior.");
  });

  it("formato inválido sigue siendo un error (con y sin contexto)", () => {
    expect(raceDateRuleError("2027-02-30", "", TODAY)).toBe("Revisa la fecha de competencia.");
    expect(validateSportsInfo({ ...sports, raceDate: "2027-13-01" }).raceDate).toBe("Revisa la fecha de competencia.");
    // Sin contexto (p. ej. solo formato en el servidor antes de leer la fecha guardada) no exige futuro.
    expect(validateSportsInfo({ ...sports, raceDate: "2020-01-01" }).raceDate).toBeUndefined();
  });
});

describe("RaceCountdown", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sin fecha: «Entrenamiento continuo», sin cuenta regresiva", () => {
    render(<RaceCountdown raceDate="" />);
    expect(screen.getByText("Entrenamiento continuo")).toBeInTheDocument();
    expect(screen.queryByText(/Faltan/)).not.toBeInTheDocument();
    expect(screen.queryByText(/carrera/)).not.toBeInTheDocument();
  });

  it("con fecha futura: cuenta regresiva", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 25, 9, 0));
    render(<RaceCountdown raceDate="2026-12-05" />);
    expect(screen.getByText(/Faltan/)).toHaveTextContent("Faltan 10 días para tu carrera");
    expect(screen.queryByText("Entrenamiento continuo")).not.toBeInTheDocument();
  });
});
