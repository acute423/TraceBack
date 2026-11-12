export function filterReportsByLocationAndDate(reports, { location = "", since = "" } = {}) {
  const minimumDate = since ? new Date(`${since}T00:00:00`) : null;

  return reports.filter((report) => {
    if (location && (report.location || "").trim().toLowerCase() !== location.toLowerCase()) {
      return false;
    }

    if (minimumDate) {
      const reportDate = new Date(report.foundDate || report.lostDate || report.date || report.createdAt);
      if (Number.isNaN(reportDate.getTime()) || reportDate < minimumDate) return false;
    }

    return true;
  });
}
