import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip as ChartTooltip,
} from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';
import { useLanguage } from '../context/useLanguage';

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  ChartTooltip,
);

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: {
    duration: 700,
    easing: 'easeOutQuart',
  },
  plugins: {
    legend: {
      display: false,
    },
    tooltip: {
      backgroundColor: '#121C2D',
      padding: 10,
      cornerRadius: 8,
      displayColors: false,
      titleFont: { size: 12, weight: '600' },
      bodyFont: { size: 12 },
      callbacks: {
        label(context) {
          return `${context.parsed.y ?? context.parsed ?? 0}`;
        },
      },
    },
  },
  scales: {
    x: {
      grid: {
        display: false,
      },
      ticks: {
        color: '#64748b',
        font: {
          size: 11,
        },
      },
    },
    y: {
      beginAtZero: true,
      ticks: {
        color: '#64748b',
        precision: 0,
        padding: 8,
      },
      grid: {
        color: 'rgba(148, 163, 184, 0.16)',
        drawBorder: false,
      },
    },
  },
};

export default function ActorDashboardCharts({ metrics, activity, activityTitle, distribution, distributionTitle, revenue, revenueTitle, loading }) {
  const { language } = useLanguage();
  const numberLocale = language === 'en' ? 'en-US' : 'fr-FR';
  const hasActivity = activity.some((item) => item.value > 0);
  const distributionTotal = distribution.reduce((total, item) => total + item.value, 0);
  const hasRevenue = revenue?.some((item) => item.value > 0);

  const activityChart = {
    labels: activity.map((item) => item.label),
    datasets: [
      {
        label: language === 'en' ? 'Operations' : 'Opérations',
        data: activity.map((item) => item.value),
        borderColor: '#2F80ED',
        backgroundColor: 'rgba(47, 128, 237, 0.16)',
        fill: true,
        borderWidth: 3,
        borderCapStyle: 'round',
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointBackgroundColor: '#ffffff',
        pointBorderColor: '#2F80ED',
        pointBorderWidth: 2,
      },
    ],
  };

  const distributionChart = {
    labels: distribution.map((item) => item.label),
    datasets: [
      {
        data: distribution.map((item) => item.value),
        backgroundColor: distribution.map((item) => item.color),
        borderColor: '#ffffff',
        borderWidth: 2,
      },
    ],
  };

  const revenueChart = revenue && {
    labels: revenue.map((item) => item.label),
    datasets: [{
      label: language === 'en' ? 'Payouts' : 'Revenus reversés',
      data: revenue.map((item) => item.value),
      borderColor: '#168A78',
      backgroundColor: 'rgba(22, 138, 120, 0.12)',
      fill: true,
      borderWidth: 3,
      tension: 0.4,
      pointRadius: 4,
      pointHoverRadius: 7,
      pointBackgroundColor: '#ffffff',
      pointBorderColor: '#168A78',
      pointBorderWidth: 2,
    }],
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ label, value, detail, icon: Icon, accent }) => (
          <section key={label} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500">{label}</p>
              <Icon size={18} className={accent ? 'text-[#FF6A3D]' : 'text-slate-400'} />
            </div>
            <p className={`mt-3 text-2xl font-bold ${accent ? 'text-[#FF6A3D]' : 'text-[#121C2D]'}`}>{loading ? '—' : value}</p>
            <p className="mt-1 min-h-4 text-xs text-slate-400">{loading ? 'Chargement…' : detail}</p>
          </section>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3">
            <h2 className="font-bold text-[#121C2D]">{activityTitle}</h2>
            <p className="text-sm text-slate-500">Évolution sur les six derniers mois</p>
          </div>
          {loading ? (
            <ChartEmpty label="Chargement des données…" />
          ) : !hasActivity ? (
            <ChartEmpty label="Aucune activité sur cette période." />
          ) : (
            <div className="h-60 min-w-0" role="img" aria-label={activityTitle}>
              <Line data={activityChart} options={{
                ...chartOptions,
                plugins: {
                  ...chartOptions.plugins,
                  legend: { display: false },
                },
                interaction: {
                  intersect: false,
                  mode: 'index',
                },
              }} />
            </div>
          )}
        </section>

        <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3">
            <h2 className="font-bold text-[#121C2D]">{distributionTitle}</h2>
            <p className="text-sm text-slate-500">Répartition actuelle</p>
          </div>
          {loading ? (
            <ChartEmpty label="Chargement des données…" />
          ) : !distributionTotal ? (
            <ChartEmpty label="Aucune donnée à répartir." />
          ) : (
            <div className="grid min-h-56 grid-cols-[minmax(120px,0.9fr)_minmax(120px,1.1fr)] items-center gap-3 sm:gap-5">
              <div className="relative h-48 min-w-0" role="img" aria-label={distributionTitle}>
                <Doughnut
                  data={distributionChart}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '72%',
                    radius: '94%',
                    animation: { animateRotate: true, duration: 800 },
                    hoverOffset: 8,
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        backgroundColor: '#121C2D',
                        padding: 10,
                        cornerRadius: 8,
                        callbacks: {
                          label(context) {
                            return `${context.label}: ${context.parsed.toLocaleString(numberLocale)}`;
                          },
                        },
                      },
                    },
                  }}
                />
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold leading-none text-[#121C2D]">{distributionTotal.toLocaleString(numberLocale)}</span>
                  <span className="mt-1 text-[10px] font-medium uppercase text-slate-400">au total</span>
                </div>
              </div>
              <div className="space-y-3">
                {distribution.map((item) => (
                  <div key={item.label} className="flex items-center justify-between gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} /> <span className="truncate">{item.label}</span></span>
                    <strong className="text-[#121C2D]">{item.value.toLocaleString(numberLocale)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {revenue && (
          <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
            <div className="mb-3">
              <h2 className="font-bold text-[#121C2D]">{revenueTitle}</h2>
              <p className="text-sm text-slate-500">Sommes nettes effectivement reversées sur les six derniers mois</p>
            </div>
            {loading ? (
              <ChartEmpty label="Chargement des données…" />
            ) : !hasRevenue ? (
              <ChartEmpty label="Aucun reversement reçu sur cette période." />
            ) : (
              <div className="h-60 min-w-0" role="img" aria-label={revenueTitle}>
                <Line
                  data={revenueChart}
                  options={{
                    ...chartOptions,
                    interaction: { intersect: false, mode: 'index' },
                    plugins: {
                      ...chartOptions.plugins,
                      tooltip: {
                        ...chartOptions.plugins.tooltip,
                        callbacks: {
                          label(context) {
                            return `${context.parsed.y.toLocaleString('fr-FR')} FCFA`;
                          },
                        },
                      },
                    },
                    scales: {
                      ...chartOptions.scales,
                      y: {
                        ...chartOptions.scales.y,
                        ticks: {
                          ...chartOptions.scales.y.ticks,
                          callback(value) {
                            return `${Number(value).toLocaleString('fr-FR')} FCFA`;
                          },
                        },
                      },
                    },
                  }}
                />
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function ChartEmpty({ label }) {
  return <div className="grid h-56 place-items-center text-center text-sm text-slate-400">{label}</div>;
}
