/** An exam's title as shown: "(dự kiến)" follows a tentative date (older rows may already carry it in the title). */
export function assessmentLabel(title: string, tentative: boolean): string {
  return tentative && !/\(dự kiến\)/i.test(title) ? `${title} (dự kiến)` : title;
}
