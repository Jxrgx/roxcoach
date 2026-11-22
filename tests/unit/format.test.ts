import { describe, expect, it } from "vitest";
import {
  daysBetween,
  formatClock,
  formatDuration,
  getWeek,
  initials,
  normalizeSearch,
  relativeDayLabel,
  toLocalDateKey,
} from "@/lib/utils/format";
import { getUpcomingSessions, mockAthletePlan } from "@/lib/mock/athlete";

describe("formatDuration", () => {
  it("formatea minutos y horas", () => {
    expect(formatDuration(65)).toBe("1 h 5 min");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(120)).toBe("2 h");
  });
});

describe("formatClock", () => {
  it("formatea mm:ss y h:mm:ss", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(90)).toBe("01:30");
    expect(formatClock(3892)).toBe("1:04:52");
    expect(formatClock(-5)).toBe("00:00");
  });
});

describe("getWeek", () => {
  it("devuelve lunes a domingo con hoy marcado", () => {
    const saturday = new Date(2026, 10, 21); // sábado 21 nov 2026
    const week = getWeek(saturday);
    expect(week).toHaveLength(7);
    expect(week[0]?.label).toBe("Lun");
    expect(week[0]?.dayOfMonth).toBe(16);
    expect(week[5]?.isToday).toBe(true);
    expect(week.map((d) => d.offset)).toEqual([-5, -4, -3, -2, -1, 0, 1]);
  });

  it("trata el domingo como último día de la semana", () => {
    const sunday = new Date(2026, 10, 22);
    const week = getWeek(sunday);
    expect(week[6]?.isToday).toBe(true);
    expect(week[0]?.offset).toBe(-6);
  });
});

describe("fechas", () => {
  it("calcula días naturales sin importar la hora", () => {
    expect(daysBetween(new Date(2026, 0, 1, 23), new Date(2026, 0, 2, 1))).toBe(1);
  });

  it("genera la clave local sin desfase UTC", () => {
    expect(toLocalDateKey(new Date(2026, 10, 21, 23, 30))).toBe("2026-11-21");
  });

  it("etiqueta offsets relativos", () => {
    expect(relativeDayLabel(0)).toBe("Hoy");
    expect(relativeDayLabel(1)).toBe("Mañana");
    expect(relativeDayLabel(3)).toBe("En 3 días");
    expect(relativeDayLabel(-2)).toBe("Hace 2 días");
  });
});

describe("texto", () => {
  it("obtiene iniciales", () => {
    expect(initials("Alex Martínez")).toBe("AM");
    expect(initials("Jorge M.")).toBe("JM");
  });

  it("normaliza búsquedas sin acentos ni mayúsculas", () => {
    expect(normalizeSearch("  Sofía ")).toBe("sofia");
  });
});

describe("plan del atleta", () => {
  it("las próximas sesiones excluyen descansos y hoy", () => {
    const next = getUpcomingSessions(mockAthletePlan, 2);
    expect(next).toHaveLength(2);
    expect(next.every((s) => s.dayOffset > 0 && s.status !== "descanso")).toBe(true);
    expect(next[0]!.dayOffset).toBeLessThan(next[1]!.dayOffset);
  });
});
