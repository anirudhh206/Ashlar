import { recurringConditionalPayment } from './recurringConditionalPayment.js';
import { oneTimeApprovalGatedTransfer } from './oneTimeApprovalGatedTransfer.js';

export const templates = [recurringConditionalPayment, oneTimeApprovalGatedTransfer] as const;
