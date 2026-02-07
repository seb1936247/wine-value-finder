interface Props {
  score: number | null;
}

export default function ValueBadge({ score }: Props) {
  if (score === null) {
    return <span className="text-xs text-gray-400">--</span>;
  }

  let bg: string;
  let text: string;
  let label: string;

  if (score >= 50) {
    bg = 'bg-green-100 text-green-800';
    text = String(score);
    label = 'Great';
  } else if (score >= 35) {
    bg = 'bg-yellow-100 text-yellow-800';
    text = String(score);
    label = 'Good';
  } else if (score >= 20) {
    bg = 'bg-orange-100 text-orange-800';
    text = String(score);
    label = 'Fair';
  } else {
    bg = 'bg-red-100 text-red-800';
    text = String(score);
    label = 'Poor';
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${bg}`}>
      {text}
      <span className="font-normal opacity-75">{label}</span>
    </span>
  );
}
