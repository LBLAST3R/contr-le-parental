// Affiche le message d'erreur après un échec de connexion (?error=1).
(() => {
  const params = new URLSearchParams(location.search);
  if (params.get("error")) {
    const err = document.getElementById("err");
    if (err) err.classList.remove("hidden");
  }
})();
