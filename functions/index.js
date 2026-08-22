const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');

const REGION = 'asia-east1';
const GOOGLE_CHAT_WEBHOOK = defineSecret('GOOGLE_CHAT_WEBHOOK');

const STAGE_LABELS = {
  prepare: '準備簽名資料',
  generate_pdf: '產生 PDF',
  upload_pdf: '上傳 PDF',
  upload_signature: '上傳簽名圖檔',
  save_firestore: '寫入簽名資料',
  send_email: '寄送 Email',
  complete: '完成提交',
  unknown: '未指定階段',
};

const clip = (value, maxLength, fallback = '') => {
  const text = String(value == null ? '' : value).trim();
  return (text || fallback).slice(0, maxLength);
};

const escapeHtml = (value) => clip(value, 500)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const percent = (value, fallback = 0) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
};

const stageLabel = (stage) => STAGE_LABELS[stage] || STAGE_LABELS.unknown;

function formatTimestamp(value) {
  try {
    const date = value?.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(date.getTime())) return '未提供';
    return date.toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei',
      hour12: false,
    });
  } catch (error) {
    return '未提供';
  }
}

function buildChatPayload({ cardId, title, subtitle, summary, rows }) {
  const widgets = [
    { textParagraph: { text: escapeHtml(summary) } },
    ...rows.map(({ label, text }) => ({
      decoratedText: {
        topLabel: escapeHtml(label),
        text: escapeHtml(text),
        wrapText: true,
      },
    })),
  ];

  return {
    text: summary,
    cardsV2: [{
      cardId,
      card: {
        header: {
          title: escapeHtml(title),
          subtitle: escapeHtml(subtitle),
        },
        sections: [{ widgets }],
      },
    }],
  };
}

async function pushToGoogleChat(payload, context) {
  const webhook = String(GOOGLE_CHAT_WEBHOOK.value() || '').trim();
  if (!webhook) {
    logger.error(`[${context}] GOOGLE_CHAT_WEBHOOK 尚未設定`);
    return false;
  }

  try {
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logger.error(`[${context}] Google Chat 回應失敗`, { status: response.status });
      return false;
    }

    logger.info(`[${context}] Google Chat 通知已送出`);
    return true;
  } catch (error) {
    logger.error(`[${context}] Google Chat 網路請求失敗`, error);
    return false;
  }
}

function signatureSuccessPayload(signatureId, data) {
  const city = clip(data.city, 40, '未提供縣市');
  const school = clip(data.school, 80, '未提供學校');
  const studentName = clip(data.studentName, 80, '未提供');
  const grade = clip(data.grade, 10, '?');
  const cls = clip(data.cls, 10, '?');
  const seat = clip(data.seat, 10, '?');
  const agreement = data.isAgreed === true ? '同意授權' : data.isAgreed === false ? '不同意授權' : '未提供';
  const summary = `簽名資料已成功保存：${school}／${studentName}`;

  return buildChatPayload({
    cardId: `signature-success-${signatureId}`,
    title: '✅ 簽名提交成功',
    subtitle: '家長線上簽名系統',
    summary,
    rows: [
      { label: '狀態', text: '成功' },
      { label: '進度', text: '簽名圖檔、PDF 與資料已保存（100%）' },
      { label: '學校', text: `${city} ${school}` },
      { label: '學生', text: studentName },
      { label: '班級／座號', text: `${grade} 年 ${cls} 班／${seat} 號` },
      { label: '授權意願', text: agreement },
      { label: '資料編號', text: signatureId },
      { label: '時間', text: formatTimestamp(data.timestamp) },
    ],
  });
}

exports.onSignatureCreated = onDocumentCreated(
  {
    document: 'signatures/{signatureId}',
    region: REGION,
    secrets: [GOOGLE_CHAT_WEBHOOK],
    maxInstances: 3,
    timeoutSeconds: 15,
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      logger.warn('[onSignatureCreated] 找不到新增文件內容');
      return;
    }

    const data = snapshot.data();
    const signatureId = clip(event.params.signatureId, 120, 'unknown');
    await pushToGoogleChat(
      signatureSuccessPayload(signatureId, data),
      'onSignatureCreated',
    );
  },
);

exports.reportSignatureFailure = onCall(
  {
    region: REGION,
    secrets: [GOOGLE_CHAT_WEBHOOK],
    cors: true,
    maxInstances: 5,
    timeoutSeconds: 15,
  },
  async (request) => {
    const data = request.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new HttpsError('invalid-argument', '通知資料格式不正確');
    }

    const stage = clip(data.stage, 40, 'unknown');
    const progress = percent(data.progress);
    const message = clip(data.message, 500, '未提供錯誤訊息');
    const recordId = clip(data.recordId, 120, '尚未建立');
    const context = clip(data.context, 120, 'SignatureForm');
    const recordSaved = recordId !== '尚未建立';
    const summary = recordSaved
      ? `簽名資料已保存，但${stageLabel(stage)}失敗（${progress}%）`
      : `簽名服務失敗：${stageLabel(stage)}（${progress}%）`;
    const identity = request.auth?.token?.email || request.auth?.token?.name || '公開使用者';

    const payload = buildChatPayload({
      cardId: `signature-failure-${Date.now()}`,
      title: recordSaved ? '⚠️ 簽名已保存，後續處理失敗' : '❌ 簽名服務失敗',
      subtitle: '家長線上簽名系統',
      summary,
      rows: [
        { label: '狀態', text: recordSaved ? '部分成功' : '失敗' },
        { label: '進度', text: `${stageLabel(stage)}（${progress}%）` },
        { label: '錯誤訊息', text: message },
        { label: '資料是否已保存', text: recordId === '尚未建立' ? '否' : `是（${recordId}）` },
        { label: '發生位置', text: context },
        { label: '使用者', text: identity },
        { label: '時間', text: formatTimestamp(new Date()) },
      ],
    });

    const delivered = await pushToGoogleChat(payload, 'reportSignatureFailure');
    return { ok: delivered };
  },
);
