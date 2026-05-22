export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (url.hostname === 'admin.only1led.com' && (url.pathname === '/' || url.pathname === '')) {
    return Response.redirect('https://admin.only1led.com/admin.html', 301);
  }

  return context.next();
}
