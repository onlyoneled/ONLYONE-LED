function bufToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

const PROMPT = `이 PDF는 견적서입니다. 아래 JSON 형식으로 데이터를 추출해주세요.
반드시 유효한 JSON만 출력하고, 다른 텍스트는 절대 포함하지 마세요.

{
  "title": "견적서 제목 (없으면 null)",
  "date": "견적 날짜 YYYY-MM-DD (없으면 null)",
  "items": [
    { "name": "품목명", "quantity": 수량(숫자), "unit_price": 단가(숫자,원), "amount": 금액(숫자,원) }
  ],
  "content": "견적 내용 요약 또는 특이사항 (없으면 null)",
  "total_price": 총액(숫자,원, 없으면 null)
}`;

export async function extractQuoteData(apiKey, pdfBuffer, vendorName, fileName) {
  const base64 = bufToBase64(pdfBuffer);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 },
          },
          {
            type: 'text',
            text: `업체명: ${vendorName} / 파일명: ${fileName}\n\n${PROMPT}`,
          },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API ${res.status}: ${body}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text?.trim() || '';

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`Claude returned no JSON for ${fileName}`);

  return JSON.parse(match[0]);
}
