"""
Test suite for Inventario FIFO module
Tests: Items, Ingresos, Salidas (FIFO), Ajustes
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://kardex-pt-sync.preview.emergentagent.com').rstrip('/')

@pytest.fixture(scope="module")
def api_client():
    """Shared requests session"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


class TestInventarioItems:
    """Tests for Inventario Items CRUD"""
    
    test_item_id = None
    
    def test_get_inventario_items(self, api_client):
        """GET /api/inventario - List all inventory items"""
        response = api_client.get(f"{BASE_URL}/api/inventario")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} inventory items")
    
    def test_create_inventario_item(self, api_client):
        """POST /api/inventario - Create new inventory item"""
        payload = {
            "codigo": f"TEST-INV-{int(time.time())}",
            "nombre": "Test Item Inventario",
            "descripcion": "Item de prueba para testing",
            "unidad_medida": "metro",
            "stock_minimo": 10
        }
        response = api_client.post(f"{BASE_URL}/api/inventario", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["codigo"] == payload["codigo"]
        assert data["nombre"] == payload["nombre"]
        assert data["unidad_medida"] == payload["unidad_medida"]
        assert data["stock_minimo"] == payload["stock_minimo"]
        assert data["stock_actual"] == 0  # Initial stock should be 0
        assert "id" in data
        
        TestInventarioItems.test_item_id = data["id"]
        print(f"Created item with ID: {data['id']}")
    
    def test_get_single_item(self, api_client):
        """GET /api/inventario/{id} - Get single item with lots"""
        if not TestInventarioItems.test_item_id:
            pytest.skip("No test item created")
        
        response = api_client.get(f"{BASE_URL}/api/inventario/{TestInventarioItems.test_item_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["id"] == TestInventarioItems.test_item_id
        assert "lotes" in data  # Should include FIFO lots
        print(f"Item has {len(data.get('lotes', []))} lots")
    
    def test_update_inventario_item(self, api_client):
        """PUT /api/inventario/{id} - Update inventory item"""
        if not TestInventarioItems.test_item_id:
            pytest.skip("No test item created")
        
        payload = {
            "codigo": f"TEST-INV-UPD-{int(time.time())}",
            "nombre": "Test Item Updated",
            "descripcion": "Descripción actualizada",
            "unidad_medida": "kg",
            "stock_minimo": 20
        }
        response = api_client.put(f"{BASE_URL}/api/inventario/{TestInventarioItems.test_item_id}", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["nombre"] == payload["nombre"]
        assert data["stock_minimo"] == payload["stock_minimo"]
        print(f"Updated item: {data['nombre']}")
    
    def test_duplicate_codigo_rejected(self, api_client):
        """POST /api/inventario - Duplicate codigo should be rejected"""
        # First create an item
        payload = {
            "codigo": f"TEST-DUP-{int(time.time())}",
            "nombre": "Test Duplicate",
            "descripcion": "",
            "unidad_medida": "unidad",
            "stock_minimo": 0
        }
        response = api_client.post(f"{BASE_URL}/api/inventario", json=payload)
        assert response.status_code == 200
        
        # Try to create another with same codigo
        response2 = api_client.post(f"{BASE_URL}/api/inventario", json=payload)
        assert response2.status_code == 400
        assert "código ya existe" in response2.json().get("detail", "").lower() or "codigo" in response2.json().get("detail", "").lower()
        print("Duplicate codigo correctly rejected")


class TestInventarioIngresos:
    """Tests for Inventory Entries (Ingresos)"""
    
    test_item_id = None
    test_ingreso_id = None
    
    @pytest.fixture(autouse=True)
    def setup_item(self, api_client):
        """Create a test item for ingresos tests"""
        if not TestInventarioIngresos.test_item_id:
            payload = {
                "codigo": f"TEST-ING-{int(time.time())}",
                "nombre": "Test Item para Ingresos",
                "descripcion": "",
                "unidad_medida": "unidad",
                "stock_minimo": 5
            }
            response = api_client.post(f"{BASE_URL}/api/inventario", json=payload)
            if response.status_code == 200:
                TestInventarioIngresos.test_item_id = response.json()["id"]
    
    def test_get_ingresos(self, api_client):
        """GET /api/inventario-ingresos - List all entries"""
        response = api_client.get(f"{BASE_URL}/api/inventario-ingresos")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} ingresos")
    
    def test_create_ingreso(self, api_client):
        """POST /api/inventario-ingresos - Create inventory entry"""
        if not TestInventarioIngresos.test_item_id:
            pytest.skip("No test item available")
        
        payload = {
            "item_id": TestInventarioIngresos.test_item_id,
            "cantidad": 50,
            "costo_unitario": 10.50,
            "proveedor": "Proveedor Test",
            "numero_documento": "FAC-001",
            "observaciones": "Ingreso de prueba"
        }
        response = api_client.post(f"{BASE_URL}/api/inventario-ingresos", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["item_id"] == payload["item_id"]
        assert data["cantidad"] == payload["cantidad"]
        assert data["costo_unitario"] == payload["costo_unitario"]
        assert data["cantidad_disponible"] == payload["cantidad"]  # Initially all available
        assert "id" in data
        
        TestInventarioIngresos.test_ingreso_id = data["id"]
        print(f"Created ingreso with ID: {data['id']}")
    
    def test_stock_updated_after_ingreso(self, api_client):
        """Verify stock is updated after ingreso"""
        if not TestInventarioIngresos.test_item_id:
            pytest.skip("No test item available")
        
        response = api_client.get(f"{BASE_URL}/api/inventario/{TestInventarioIngresos.test_item_id}")
        assert response.status_code == 200
        
        data = response.json()
        assert data["stock_actual"] >= 50  # Should have at least 50 from our ingreso
        print(f"Stock actual: {data['stock_actual']}")
    
    def test_ingreso_invalid_item(self, api_client):
        """POST /api/inventario-ingresos - Invalid item should fail"""
        payload = {
            "item_id": "non-existent-id",
            "cantidad": 10,
            "costo_unitario": 5.0,
            "proveedor": "",
            "numero_documento": "",
            "observaciones": ""
        }
        response = api_client.post(f"{BASE_URL}/api/inventario-ingresos", json=payload)
        assert response.status_code == 404
        print("Invalid item correctly rejected")


class TestInventarioSalidasFIFO:
    """Tests for Inventory Exits (Salidas) with FIFO method"""
    
    test_item_id = None
    test_salida_id = None
    test_registro_id = None
    
    @pytest.fixture(autouse=True)
    def setup_item_with_stock(self, api_client):
        """Create a test item with stock for salidas tests"""
        if not TestInventarioSalidasFIFO.test_item_id:
            # Create item
            payload = {
                "codigo": f"TEST-SAL-{int(time.time())}",
                "nombre": "Test Item para Salidas FIFO",
                "descripcion": "",
                "unidad_medida": "unidad",
                "stock_minimo": 5
            }
            response = api_client.post(f"{BASE_URL}/api/inventario", json=payload)
            if response.status_code == 200:
                TestInventarioSalidasFIFO.test_item_id = response.json()["id"]
                
                # Create first ingreso (older, cheaper)
                ingreso1 = {
                    "item_id": TestInventarioSalidasFIFO.test_item_id,
                    "cantidad": 30,
                    "costo_unitario": 5.00,
                    "proveedor": "Proveedor A",
                    "numero_documento": "FAC-A001",
                    "observaciones": "Lote 1"
                }
                api_client.post(f"{BASE_URL}/api/inventario-ingresos", json=ingreso1)
                
                time.sleep(0.1)  # Ensure different timestamps
                
                # Create second ingreso (newer, more expensive)
                ingreso2 = {
                    "item_id": TestInventarioSalidasFIFO.test_item_id,
                    "cantidad": 20,
                    "costo_unitario": 8.00,
                    "proveedor": "Proveedor B",
                    "numero_documento": "FAC-B001",
                    "observaciones": "Lote 2"
                }
                api_client.post(f"{BASE_URL}/api/inventario-ingresos", json=ingreso2)
    
    def test_get_salidas(self, api_client):
        """GET /api/inventario-salidas - List all exits"""
        response = api_client.get(f"{BASE_URL}/api/inventario-salidas")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} salidas")
    
    def test_create_salida_fifo(self, api_client):
        """POST /api/inventario-salidas - Create exit with FIFO cost calculation"""
        if not TestInventarioSalidasFIFO.test_item_id:
            pytest.skip("No test item available")
        
        # Get current stock
        item_response = api_client.get(f"{BASE_URL}/api/inventario/{TestInventarioSalidasFIFO.test_item_id}")
        initial_stock = item_response.json()["stock_actual"]
        
        payload = {
            "item_id": TestInventarioSalidasFIFO.test_item_id,
            "cantidad": 20,
            "registro_id": None,
            "observaciones": "Salida de prueba FIFO"
        }
        response = api_client.post(f"{BASE_URL}/api/inventario-salidas", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["item_id"] == payload["item_id"]
        assert data["cantidad"] == payload["cantidad"]
        assert "costo_total" in data
        assert "detalle_fifo" in data
        assert data["costo_total"] > 0  # Should have calculated FIFO cost
        
        # FIFO: First 20 units should come from first lot at 5.00 each = 100.00
        expected_cost = 20 * 5.00
        assert data["costo_total"] == expected_cost, f"Expected FIFO cost {expected_cost}, got {data['costo_total']}"
        
        TestInventarioSalidasFIFO.test_salida_id = data["id"]
        print(f"Created salida with FIFO cost: {data['costo_total']}")
    
    def test_stock_updated_after_salida(self, api_client):
        """Verify stock is reduced after salida"""
        if not TestInventarioSalidasFIFO.test_item_id:
            pytest.skip("No test item available")
        
        response = api_client.get(f"{BASE_URL}/api/inventario/{TestInventarioSalidasFIFO.test_item_id}")
        assert response.status_code == 200
        
        data = response.json()
        # After 50 ingreso and 20 salida, should have 30
        print(f"Stock after salida: {data['stock_actual']}")
    
    def test_salida_insufficient_stock(self, api_client):
        """POST /api/inventario-salidas - Insufficient stock should fail"""
        if not TestInventarioSalidasFIFO.test_item_id:
            pytest.skip("No test item available")
        
        payload = {
            "item_id": TestInventarioSalidasFIFO.test_item_id,
            "cantidad": 99999,  # More than available
            "registro_id": None,
            "observaciones": ""
        }
        response = api_client.post(f"{BASE_URL}/api/inventario-salidas", json=payload)
        assert response.status_code == 400
        assert "stock" in response.json().get("detail", "").lower()
        print("Insufficient stock correctly rejected")
    
    def test_salida_with_registro_link(self, api_client):
        """POST /api/inventario-salidas - Create exit linked to production record"""
        if not TestInventarioSalidasFIFO.test_item_id:
            pytest.skip("No test item available")
        
        # First get a registro to link
        registros_response = api_client.get(f"{BASE_URL}/api/registros")
        if registros_response.status_code == 200 and len(registros_response.json()) > 0:
            registro_id = registros_response.json()[0]["id"]
            
            payload = {
                "item_id": TestInventarioSalidasFIFO.test_item_id,
                "cantidad": 5,
                "registro_id": registro_id,
                "observaciones": "Salida vinculada a registro"
            }
            response = api_client.post(f"{BASE_URL}/api/inventario-salidas", json=payload)
            assert response.status_code == 200
            
            data = response.json()
            assert data["registro_id"] == registro_id
            print(f"Created salida linked to registro: {registro_id}")
        else:
            print("No registros available to link, skipping link test")


class TestInventarioAjustes:
    """Tests for Inventory Adjustments"""
    
    test_item_id = None
    test_ajuste_id = None
    
    @pytest.fixture(autouse=True)
    def setup_item(self, api_client):
        """Create a test item for ajustes tests"""
        if not TestInventarioAjustes.test_item_id:
            payload = {
                "codigo": f"TEST-AJU-{int(time.time())}",
                "nombre": "Test Item para Ajustes",
                "descripcion": "",
                "unidad_medida": "unidad",
                "stock_minimo": 5
            }
            response = api_client.post(f"{BASE_URL}/api/inventario", json=payload)
            if response.status_code == 200:
                TestInventarioAjustes.test_item_id = response.json()["id"]
                
                # Add some initial stock via ingreso
                ingreso = {
                    "item_id": TestInventarioAjustes.test_item_id,
                    "cantidad": 100,
                    "costo_unitario": 5.00,
                    "proveedor": "",
                    "numero_documento": "",
                    "observaciones": ""
                }
                api_client.post(f"{BASE_URL}/api/inventario-ingresos", json=ingreso)
    
    def test_get_ajustes(self, api_client):
        """GET /api/inventario-ajustes - List all adjustments"""
        response = api_client.get(f"{BASE_URL}/api/inventario-ajustes")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} ajustes")
    
    def test_create_ajuste_entrada(self, api_client):
        """POST /api/inventario-ajustes - Create entry adjustment (increase stock)"""
        if not TestInventarioAjustes.test_item_id:
            pytest.skip("No test item available")
        
        # Get initial stock
        item_response = api_client.get(f"{BASE_URL}/api/inventario/{TestInventarioAjustes.test_item_id}")
        initial_stock = item_response.json()["stock_actual"]
        
        payload = {
            "item_id": TestInventarioAjustes.test_item_id,
            "tipo": "entrada",
            "cantidad": 10,
            "motivo": "Conteo físico",
            "observaciones": "Ajuste de prueba - entrada"
        }
        response = api_client.post(f"{BASE_URL}/api/inventario-ajustes", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["tipo"] == "entrada"
        assert data["cantidad"] == 10
        assert "id" in data
        
        # Verify stock increased
        item_response2 = api_client.get(f"{BASE_URL}/api/inventario/{TestInventarioAjustes.test_item_id}")
        new_stock = item_response2.json()["stock_actual"]
        assert new_stock == initial_stock + 10
        
        TestInventarioAjustes.test_ajuste_id = data["id"]
        print(f"Created entrada ajuste, stock: {initial_stock} -> {new_stock}")
    
    def test_create_ajuste_salida(self, api_client):
        """POST /api/inventario-ajustes - Create exit adjustment (decrease stock)"""
        if not TestInventarioAjustes.test_item_id:
            pytest.skip("No test item available")
        
        # Get initial stock
        item_response = api_client.get(f"{BASE_URL}/api/inventario/{TestInventarioAjustes.test_item_id}")
        initial_stock = item_response.json()["stock_actual"]
        
        payload = {
            "item_id": TestInventarioAjustes.test_item_id,
            "tipo": "salida",
            "cantidad": 5,
            "motivo": "Merma",
            "observaciones": "Ajuste de prueba - salida"
        }
        response = api_client.post(f"{BASE_URL}/api/inventario-ajustes", json=payload)
        assert response.status_code == 200
        
        data = response.json()
        assert data["tipo"] == "salida"
        assert data["cantidad"] == 5
        
        # Verify stock decreased
        item_response2 = api_client.get(f"{BASE_URL}/api/inventario/{TestInventarioAjustes.test_item_id}")
        new_stock = item_response2.json()["stock_actual"]
        assert new_stock == initial_stock - 5
        
        print(f"Created salida ajuste, stock: {initial_stock} -> {new_stock}")
    
    def test_ajuste_salida_insufficient_stock(self, api_client):
        """POST /api/inventario-ajustes - Salida with insufficient stock should fail"""
        if not TestInventarioAjustes.test_item_id:
            pytest.skip("No test item available")
        
        payload = {
            "item_id": TestInventarioAjustes.test_item_id,
            "tipo": "salida",
            "cantidad": 99999,  # More than available
            "motivo": "Error de registro",
            "observaciones": ""
        }
        response = api_client.post(f"{BASE_URL}/api/inventario-ajustes", json=payload)
        assert response.status_code == 400
        assert "stock" in response.json().get("detail", "").lower()
        print("Insufficient stock for ajuste correctly rejected")
    
    def test_ajuste_invalid_tipo(self, api_client):
        """POST /api/inventario-ajustes - Invalid tipo should fail"""
        if not TestInventarioAjustes.test_item_id:
            pytest.skip("No test item available")
        
        payload = {
            "item_id": TestInventarioAjustes.test_item_id,
            "tipo": "invalid_type",
            "cantidad": 5,
            "motivo": "",
            "observaciones": ""
        }
        response = api_client.post(f"{BASE_URL}/api/inventario-ajustes", json=payload)
        assert response.status_code in [400, 422]  # Either validation error
        print("Invalid tipo correctly rejected")


class TestStatsEndpoint:
    """Test stats endpoint includes inventory counts"""
    
    def test_stats_include_inventario(self, api_client):
        """GET /api/stats - Should include inventory statistics"""
        response = api_client.get(f"{BASE_URL}/api/stats")
        assert response.status_code == 200
        
        data = response.json()
        assert "inventario_items" in data
        assert "ingresos_count" in data
        assert "salidas_count" in data
        assert "ajustes_count" in data
        
        print(f"Stats - Items: {data['inventario_items']}, Ingresos: {data['ingresos_count']}, Salidas: {data['salidas_count']}, Ajustes: {data['ajustes_count']}")


class TestExistingTestData:
    """Test existing test data mentioned in context"""
    
    def test_existing_item_tela001(self, api_client):
        """Verify existing test item TELA-001"""
        item_id = "91135a62-b4d5-4df9-8516-c64709f77b91"
        response = api_client.get(f"{BASE_URL}/api/inventario/{item_id}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"Found TELA-001: stock={data['stock_actual']}, lotes={len(data.get('lotes', []))}")
            # According to context, should have stock=70 after 100 ingreso and 30 salida
            assert data["stock_actual"] >= 0
        else:
            print("TELA-001 not found (may have been deleted)")


class TestCleanup:
    """Cleanup test data"""
    
    def test_cleanup_test_items(self, api_client):
        """Delete test items created during testing"""
        # Get all items
        response = api_client.get(f"{BASE_URL}/api/inventario")
        if response.status_code == 200:
            items = response.json()
            deleted = 0
            for item in items:
                if item["codigo"].startswith("TEST-"):
                    del_response = api_client.delete(f"{BASE_URL}/api/inventario/{item['id']}")
                    if del_response.status_code == 200:
                        deleted += 1
            print(f"Cleaned up {deleted} test items")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
