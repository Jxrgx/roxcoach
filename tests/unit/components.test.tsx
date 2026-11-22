import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/field";
import { Tabs } from "@/components/ui/tabs";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SessionStatus } from "@/components/workouts/session-status";
import { SetLogger } from "@/components/athlete/set-logger";
import { filterAthletes } from "@/components/coach/athlete-list";
import { mockAthletes } from "@/lib/mock/coach";

describe("Button", () => {
  it("se deshabilita y anuncia el estado mientras guarda", () => {
    render(<Button loading>Guardar</Button>);
    const btn = screen.getByRole("button", { name: "Guardando…" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
  });
});

describe("IconButton", () => {
  it("expone un nombre accesible", () => {
    render(<IconButton label="Cerrar" icon={<span />} />);
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeInTheDocument();
  });
});

describe("Input", () => {
  it("asocia label y error al control", () => {
    render(<Input label="Correo" error="Revisa el formato del correo." />);
    const input = screen.getByLabelText("Correo");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Revisa el formato del correo.");
  });
});

describe("Tabs", () => {
  function Harness() {
    const [v, setV] = useState<"a" | "b" | "c">("a");
    return (
      <Tabs
        label="Filtro"
        value={v}
        onChange={setV}
        items={[
          { value: "a", label: "Todas" },
          { value: "b", label: "Pendientes" },
          { value: "c", label: "Completadas" },
        ]}
      />
    );
  }

  it("se navega con flechas (roving tabindex)", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const first = screen.getByRole("tab", { name: "Todas" });
    expect(first).toHaveAttribute("aria-selected", "true");
    first.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Pendientes" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Pendientes" })).toHaveFocus();
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Completadas" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("ProgressBar", () => {
  it("expone valores ARIA", () => {
    render(<ProgressBar value={3} max={5} label="Semana" valueText="3 de 5" />);
    const bar = screen.getByRole("progressbar", { name: "Semana" });
    expect(bar).toHaveAttribute("aria-valuenow", "3");
    expect(bar).toHaveAttribute("aria-valuetext", "3 de 5");
  });
});

describe("SessionStatus", () => {
  it("comunica el estado con texto, no solo color", () => {
    render(<SessionStatus status="omitida" />);
    expect(screen.getByText("No realizada")).toBeInTheDocument();
  });
});

describe("SetLogger", () => {
  it("separa planeado de realizado y guarda el resultado real", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<SetLogger exerciseName="Sled Push" setNumber={1} totalSets={4} planned={{ loadKg: 152, distanceMeters: 12.5 }} onSave={onSave} />);

    expect(screen.getByText("Planeado")).toBeInTheDocument();
    expect(screen.getByText("152 kg · 12.5 m")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Sumar 2.5 kg" }));
    await user.click(screen.getByRole("radio", { name: "8" }));
    await user.click(screen.getByRole("button", { name: "Guardar serie" }));

    expect(onSave).toHaveBeenCalledWith({ actualLoadKg: 154.5, actualAmount: 12.5, rpe: 8 });
    expect(await screen.findByText("Serie guardada.")).toBeInTheDocument();
    // Lo planeado no cambia.
    expect(screen.getByText("152 kg · 12.5 m")).toBeInTheDocument();
  });

  it("muestra errores y no guarda si faltan datos", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<SetLogger exerciseName="Wall Balls" setNumber={1} totalSets={3} planned={{ reps: 20 }} onSave={onSave} />);
    const amount = screen.getByLabelText(/Repeticiones real/);
    await user.clear(amount);
    await user.click(screen.getByRole("button", { name: "Guardar serie" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Ingresa repeticiones real.");
  });

  it("conserva los datos si falla el guardado", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue(new Error("red"));
    render(<SetLogger exerciseName="Wall Balls" setNumber={1} totalSets={3} planned={{ reps: 20 }} onSave={onSave} />);
    await user.click(screen.getByRole("button", { name: "Guardar serie" }));
    expect(await screen.findByText(/No se pudo guardar/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Repeticiones real/)).toHaveValue("20");
  });
});

describe("filterAthletes", () => {
  it("filtra por texto sin acentos y por estado", () => {
    expect(filterAthletes(mockAthletes, "sofia", "todos").map((a) => a.name)).toEqual(["Sofía T."]);
    expect(filterAthletes(mockAthletes, "", "pendiente").every((a) => a.status === "pendiente")).toBe(true);
    expect(filterAthletes(mockAthletes, "pro", "todos").length).toBe(2);
  });
});
