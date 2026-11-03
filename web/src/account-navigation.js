// Estado visual de la sesión; los permisos siempre se comprueban en la capa de datos y RLS.
let account = null;
export function accountDestination() {
  if (!account) return {label:'Ingresar', footer:'Ingresar a mi cuenta', href:'#ingresar'};
  if (account.role==='admin') return {label:'Mi panel', footer:'Ir a mi panel', href:'#administracion'};
  if (account.role==='emprendedora') return {label:'Mi tienda', footer:'Ir a mi tienda', href:'#mi-tienda'};
  return {label:'Mi cuenta', footer:'Ir a mi cuenta', href:'#ingresar'};
}
export function setAccountNavigation(user) {
  account=user;
  const destination=accountDestination();
  document.querySelectorAll('[data-account-link]').forEach(link=>{
    link.setAttribute('href',destination.href);
    const label=link.querySelector('[data-account-label]');
    if(label)label.textContent=link.hasAttribute('data-account-footer') ? destination.footer : destination.label;
  });
}
export function knownAccountId() { return account?.uid ?? null; }
