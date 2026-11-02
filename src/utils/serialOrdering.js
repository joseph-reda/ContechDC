const SERIAL_REQUEST_TYPES = ["IR", "CPR", "TR"];

function compareText(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  return a < b ? -1 : a > b ? 1 : 0;
}

function timestampValue(value, missingValue) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : missingValue;
}

export function serialRequestType(item) {
  return String(item?.requestType || (item?.isCPR ? "CPR" : "IR")).toUpperCase();
}

export function isSerialOrderedRecord(item) {
  return !item?.isRevision && !item?.sdNo && SERIAL_REQUEST_TYPES.includes(serialRequestType(item));
}

export function serialPriorityScopeKey(item) {
  return JSON.stringify([String(item?.project || ""), serialRequestType(item), Number(item?.serialNumber)]);
}

export function compareSerialWithinScope(left, right) {
  const leftSerial = Number(left?.serialNumber);
  const rightSerial = Number(right?.serialNumber);
  const serialOrder = (Number.isSafeInteger(leftSerial) && leftSerial >= 1 ? leftSerial : Number.POSITIVE_INFINITY)
    - (Number.isSafeInteger(rightSerial) && rightSerial >= 1 ? rightSerial : Number.POSITIVE_INFINITY);
  if (serialOrder) return serialOrder;

  const priorityOrder = Number(Boolean(right?.serialOrderPriority)) - Number(Boolean(left?.serialOrderPriority));
  if (priorityOrder) return priorityOrder;

  const createdOrder = timestampValue(left?.createdAt, Number.POSITIVE_INFINITY)
    - timestampValue(right?.createdAt, Number.POSITIVE_INFINITY);
  if (createdOrder) return createdOrder;

  return compareText(left?.id || left?.uniqueId, right?.id || right?.uniqueId);
}

export function compareSerialRecords(left, right) {
  const projectOrder = compareText(left?.project, right?.project);
  if (projectOrder) return projectOrder;

  const leftType = serialRequestType(left);
  const rightType = serialRequestType(right);
  const leftRank = SERIAL_REQUEST_TYPES.indexOf(leftType);
  const rightRank = SERIAL_REQUEST_TYPES.indexOf(rightType);
  const typeOrder = (leftRank < 0 ? SERIAL_REQUEST_TYPES.length : leftRank)
    - (rightRank < 0 ? SERIAL_REQUEST_TYPES.length : rightRank)
    || compareText(leftType, rightType);
  if (typeOrder) return typeOrder;

  return compareSerialWithinScope(left, right);
}

export function sortSerialRecords(records) {
  return [...records].sort(compareSerialRecords);
}
