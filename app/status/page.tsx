import { type NextPage } from "next";
import { Suspense } from "react";
import { type HealthMetrics, HealthMetricsResponseSchema } from "@/types/health";
import { getBaseUrl } from "@/lib/utils/get-base-url";

async function getStatusData(): Promise<HealthMetrics> {
  const baseUrl = getBaseUrl();
  const res = await fetch(`${baseUrl}/api/health/metrics`, {
    cache: "no-store", // Always fetch the latest data
  });

  if (!res.ok) {
    // This will be caught by the error boundary
    throw new Error("Failed to fetch status data");
  }

  const data: unknown = await res.json();
  return HealthMetricsResponseSchema.parse(data);
}

const StatusPage: NextPage = async () => {
  const data: HealthMetrics = await getStatusData();

  const renderValue = (value: unknown) => {
    if (typeof value === "object" && value !== null) {
      return <pre className="text-sm bg-gray-800 p-2 rounded-md overflow-x-auto">{JSON.stringify(value, null, 2)}</pre>;
    }
    return <span className="text-green-400">{String(value)}</span>;
  };

  const renderSection = (title: string, sectionData: object) => (
    <div className="mb-8">
      <h2 className="text-2xl font-bold text-gray-100 border-b-2 border-gray-700 pb-2 mb-4">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(sectionData).map(([key, value]) => (
          <div key={key} className="bg-gray-900 p-4 rounded-lg shadow-md">
            <h3 className="text-lg font-semibold text-gray-300 mb-2 capitalize">{key.replace(/([A-Z])/g, " $1")}</h3>
            {renderValue(value)}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 p-4 sm:p-6 lg:p-8">
      <header className="mb-8">
        <h1 className="text-4xl font-extrabold text-white">Application Status</h1>
        <p className="text-gray-400 mt-2">
          Live metrics from the server. Last updated:{" "}
          <span className="text-cyan-400">{new Date(data.timestamp).toLocaleString()}</span>
        </p>
      </header>
      <main>
        <Suspense fallback={<div className="text-center text-xl">Loading status...</div>}>
          {renderSection("Health", data.health)}
          {renderSection("System", data.system)}
          {renderSection("Memory", data.memory.process)}
          {renderSection("Caches", data.caches)}
        </Suspense>
      </main>
    </div>
  );
};

export default StatusPage;
