
window.deleteFormat = async function(id) {
    if (!confirm('¿Seguro que desea eliminar TODO el formato de pago y sus eventos?')) return;
    
    try {
        showLoading('ELIMINANDO...');
        const res = await apiFetch('/api/admin/payment-formats/' + id, { method: 'DELETE' });
        if (res && res.success) {
            // Eliminar de la UI sin recargar todo el dashboard
            const mainRow = document.getElementById('pf-main-row-' + id);
            if (mainRow) mainRow.remove();
            const detailRow = document.getElementById('pf-details-' + id);
            if (detailRow) detailRow.remove();
            
            // Actualizar la data en memoria
            if (window.currentPaymentFormats) {
                window.currentPaymentFormats = window.currentPaymentFormats.filter(f => f.id !== id);
            }
            
            toast('Formato eliminado', 'success');
        } else {
            toast('Error al eliminar: ' + (res ? res.error : 'Desconocido'), 'error');
        }
    } catch (e) {
        toast('Error de red: ' + e.message, 'error');
    } finally {
        hideLoading();
    }
};
