interface Props {
  score: number | null;
}

export default function ValueBadge({ score }: Props) {
  if (score == null) {
    return <span className="text-xs text-slate-400 tabular-nums">--</span>;
  }

  let ringColor: string;
  let bgColor: string;
  let textColor: string;
  let label: string;

  if (score >= 50) {
    ringColor = 'ring-emerald-300';
    bgColor = 'bg-emerald-50';
    textColor = 'text-emerald-700';
    label = 'Great';
  } else if (score >= 35) {
    ringColor = 'ring-yellow-300';
    bgColor = 'bg-yellow-50';
    textColor = 'text-yellow-700';
    label = 'Good';
  } else if (score >= 20) {
    ringColor = 'ring-orange-300';
    bgColor = 'bg-orange-50';
    textColor = 'text-orange-700';
    label = 'Fair';
  } else {
    ringColor = 'ring-red-300';
    bgColor = 'bg-red-50';
    textColor = 'text-red-700';
    label = 'Poor';
  }

  return (
    <div className={`inline-flex flex-col items-center justify-center w-14 h-14 rounded-xl ring-1 ${ringColor} ${bgColor}`}>
      <span className={`text-lg font-bold tabular-nums leading-none ${textColor}`}>
        {score}
      </span>
      <span className={`text-[10px] font-medium mt-0.5 ${textColor} opacity-75`}>
        {label}
      </span>
    </div>
  );
}
