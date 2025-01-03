/**
 * Investments Page
 *
 * Showcases investment portfolio and strategy.
 * Highlights key investments and outcomes.
 */

import { Investments } from '../../components/features/investments';
import { investments } from '../../data/investments';

export default function InvestmentsPage() {
  return <Investments investments={investments} />;
}
