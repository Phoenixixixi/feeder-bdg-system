import { evaluateTrainStatus } from '../src/utils/scheduleRules';
import { FeederSchedule } from '../src/data/scheduleData';

// Mock schedule (07:46 departure)
const mockSchedule: FeederSchedule = {
  id: 'feeder-1',
  tripIndex: 1,
  departureTime: '07:46',
  feederTrainNo: 'KF-G1004',
  whooshTrainNo: 'G1004',
  origin: 'Bandung (BD)',
  destination: 'Padalarang (PDL)',
  whooshDestination: 'Halim (HLM)',
  feederDurationMin: 18,
  feederArrivalTime: '08:04',
  whooshDepartureTime: '08:23',
  transitDurationMin: 19,
  platform: 'Peron 5',
  isActive: true,
};

function testStatus(timeStr: string, label: string) {
  const [h, m, s] = timeStr.split(':').map(Number);
  const now = new Date();
  now.setHours(h, m, s, 0);
  
  const info = evaluateTrainStatus(mockSchedule, now);
  console.log(`[${label}] Time: ${timeStr} | Status: ${info.status} | Deadline: ${info.isApproachingDeadline}`);
}

console.log('--- Simulation Starting ---');
// 07:35 checking starts (11 min before 07:46)
// 07:41 close gate (5 min before 07:46)
testStatus('07:30:00', 'Pre-Checking');
testStatus('07:36:00', 'During Checking');
testStatus('07:40:30', 'Approaching Deadline'); // Should be true
testStatus('07:42:00', 'After Deadline');
testStatus('07:47:00', 'Departed');
console.log('--- Simulation Done ---');
