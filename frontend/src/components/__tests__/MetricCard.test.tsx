import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MetricCard } from "../MetricCard";

describe("MetricCard sparkline", () => {
  it("test_metric_card_sparkline renders an svg polyline when data is provided", () => {
    const { container } = render(
      <MetricCard label="Total Siswa" value={12} sparkline={[1, 3, 2, 5]} />
    );

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(container.querySelector("polyline")).not.toBeNull();
  });
});
