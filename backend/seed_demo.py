"""Script de generación de datos de demo completos."""
import asyncio, asyncpg, uuid, json, random
from datetime import date, timedelta, datetime

DB_URL = "postgres://admin:admin@72.60.241.216:9090/datos?sslmode=disable"

MARCAS = {"element": "6a7332a5-87b5-4827-8f6e-8025117fc71a", "qepo": "c70dac45-edde-444f-acb6-720715c38ddf"}
TIPOS = {"pantalon": "d4ad8861-435f-4418-8002-3a7e95a57736", "polo": "5796e77c-939e-498b-8e2d-3ea7eb6fbfed", "casaca": "652e82f2-469b-49c6-b06f-01b368611417"}
ENTALLES = {"slim": "8ee90b4c-98c2-4f96-9794-72483173f6c2", "semipitillo": "daae9245-799c-4e41-a1ff-6ad8800ceead", "baggy": "f4901223-c56f-45a1-94d0-fd0d33271769"}
TELAS = {"stretch": "f5b89cea-27a3-484d-b540-b20f37399168", "rigido": "361f5b2a-d93e-485b-ae58-d2707a0c5298", "comfort": "f4781324-45ad-488c-82ec-9de1fe747f7e"}
HILOS = {"color": "b0a8f9c4-4c44-4aaa-8499-411a56cbad35", "negro": "68ced046-f522-425d-b932-151cdc0b3b6a"}
HILOS_ESP = {"beis": "6c13702e-229e-45b7-8d8a-de77e036f00d", "plomo": "57c887fb-e3fa-4901-91c0-7d0b71dbe9d9"}
RUTAS = {"pantalon": "c7036e89-f636-4a8e-a353-cdd5f5f8010d", "polo": "a452d89f-7228-43e3-b60f-730161831a9f"}
SERVICIOS = {
    "corte": "a42eb55f-cdd9-499a-9ff8-e6cfcd153cec", "bordado": "b94b615d-cda3-45da-9109-b5333ed2249c",
    "estampado": "0fbe0687-3c5e-4ba3-abb4-65ea920c0d4c", "costura": "38b1c7d3-52c3-49f6-9140-c60a556762b9",
    "atraque": "5939b474-547e-49e8-b4c8-c2bcdb194249", "lavanderia": "fda6b832-4106-4bac-816f-ee3ec3aeac3a",
    "acabado": "6b0ea7b9-bcac-49ac-bf48-7b50211775a2",
}
PERSONAS = {
    "roger": "7809e6db-4dd8-43dd-9fc7-cc3277b661b7", "procesos": "f210e0a8-ff2b-4c2b-bf59-7d04fec6cdc8",
    "ana": "e91b1a32-ed97-49f9-a37b-abd563ece6f0", "carlos": "82bf9996-fbe4-4c30-bf38-590428cd6dcb",
    "jorge": "1bc71e5a-dcbc-4f69-8eda-881b5c33a3bc", "luis": "8f334877-1014-489b-8a2b-6e8b273f59df",
    "maria": "40f085e8-e360-453c-a4b0-e919a83cc616", "pepe": "f68a517c-8276-483a-b8a1-a12d0710edc3",
    "rosa": "53f050b2-7b6e-4d26-b3b7-a50f68511119", "jean": "c0ddadc7-7256-4f85-9135-6b7104022f2a",
    "antartida": "e233fcc4-5b92-4083-bc4c-673ca648ef89", "acabado_int": "de030a41-1c22-49d2-966c-92297409ee67",
}
LINEAS = {"denim_element": 26, "denim_qepo": 28, "polo_element": 27}
TALLAS_DENIM = {"28": "d8f21d84-5af2-46ea-bd1b-2e2e1dbd7628", "30": "bcca7c6f-061d-4e34-be1c-f7e68f879087", "32": "5e7bb3ff-91ee-4250-b43c-12c94ecd231e", "34": "1c334e4c-cb0d-4749-9c24-44ad5733a87a", "36": "52ef9da9-c3c6-41ec-a801-c0892804f5e3"}
TALLAS_POLO = {"S": "05421f5a-9ef0-4679-a4fc-99be70e9ea95", "M": "409bdaea-0e88-46a2-bf4f-c036d5723c6e", "L": "aa41e530-beb0-4733-8474-9a71cdb8a205", "XL": "43316044-735b-4c50-845b-92fbe2557b05"}
COLORES = {"celeste_claro": "cfb2947f-6958-409f-ac80-5b6a4588ce18", "madera": "215cd1dd-277b-4e6a-8669-3ac06b697070", "maiz": "a305df19-efe6-464c-a463-2075e4ebb67d", "azul": "9a5de99c-9223-4e6c-bd1b-de7d68ddbc34", "madera_oscuro": "e8853ab0-0b75-4abc-a50d-913dcb05f8e5", "celeste_oscuro": "4741fe5e-ce2a-4469-9b40-7852789c2b61"}

COSTUREROS = ["ana", "carlos", "jorge", "luis", "maria", "pepe", "rosa", "jean"]

ESTADOS_PANTALON = ["Para Corte", "Corte", "Para Costura", "Costura", "Bordado", "Para Atraque", "Atraque", "Para Lavanderia", "Lavanderia", "Para Acabado", "Acabado", "Producto Terminado", "Tienda"]
ESTADOS_POLO = ["Para Corte", "Corte", "Para Estampado", "Estampado", "Para Costura", "Costura", "Para Aacabado", "Acabado", "Producto Terminado", "Tienda"]

MOV_PANTALON = {"Corte": ("corte", "roger"), "Costura": ("costura", None), "Bordado": ("bordado", "procesos"), "Atraque": ("atraque", None), "Lavanderia": ("lavanderia", "antartida"), "Acabado": ("acabado", "acabado_int")}
MOV_POLO = {"Corte": ("corte", "roger"), "Estampado": ("estampado", None), "Costura": ("costura", None), "Acabado": ("acabado", "acabado_int")}


async def main():
    pool = await asyncpg.create_pool(DB_URL, server_settings={"search_path": "produccion,public"})
    async with pool.acquire() as conn:
        # ========== 1. Personas faltantes ==========
        print("=== Creando personas faltantes ===")
        for nombre, serv_key, tarifa in [("Estampados Lima", "estampado", 1.50), ("Ojales Express", "atraque", 0.80)]:
            pid = await conn.fetchval("SELECT id FROM prod_personas_produccion WHERE nombre = $1", nombre)
            if not pid:
                pid = str(uuid.uuid4())
                svc = json.dumps([{"servicio_id": SERVICIOS[serv_key], "tarifa": tarifa}])
                await conn.execute(
                    "INSERT INTO prod_personas_produccion (id, nombre, tipo_persona, activo, servicios) VALUES ($1, $2, 'EXTERNO', true, $3)",
                    pid, nombre, svc)
                print(f"  Creado: {nombre}")
            else:
                print(f"  Ya existe: {nombre}")
            PERSONAS[serv_key + "_p"] = pid

        # ========== 2. Limpiar datos ==========
        print("\n=== Limpiando datos existentes ===")
        for t in ["prod_arreglos", "prod_fallados", "prod_mermas", "prod_paralizacion", "prod_incidencia",
                   "prod_movimientos_produccion", "prod_registro_tallas", "prod_guias_remision"]:
            try:
                c = await conn.fetchval(f"SELECT COUNT(*) FROM {t}")
                await conn.execute(f"DELETE FROM {t}")
                print(f"  {t}: {c}")
            except Exception as e:
                print(f"  {t}: skip ({e})")

        await conn.execute("DELETE FROM prod_registros")
        print("  prod_registros: limpio")

        try:
            await conn.execute("DELETE FROM prod_modelo_materiales")
        except:
            pass
        await conn.execute("DELETE FROM prod_modelos")
        print("  prod_modelos: limpio")

        try:
            c = await conn.fetchval("SELECT COUNT(*) FROM prod_inventario WHERE codigo LIKE 'PT-%'")
            if c > 0:
                await conn.execute("DELETE FROM prod_inventario_movimientos WHERE item_id IN (SELECT id FROM prod_inventario WHERE codigo LIKE 'PT-%')")
                await conn.execute("DELETE FROM prod_inventario WHERE codigo LIKE 'PT-%'")
                print(f"  PT items: {c}")
        except:
            pass

        # ========== 3. Crear modelos ==========
        print("\n=== Creando modelos ===")
        modelos = []
        modelo_defs = [
            ("OXFORD 505", "element", "pantalon", "semipitillo", "comfort", "color", "beis", "pantalon", "denim_element", "2-3-3-2", "denim"),
            ("RANGER MX", "element", "pantalon", "baggy", "rigido", "negro", "plomo", "pantalon", "denim_element", "2-3-3-2-1", "denim"),
            ("SLIM EDGE", "element", "pantalon", "slim", "stretch", "color", "beis", "pantalon", "denim_element", "1-2-3-2-1", "denim"),
            ("TOKYO 77", "qepo", "pantalon", "semipitillo", "stretch", "color", "beis", "pantalon", "denim_qepo", "2-3-3-2", "denim"),
            ("BRONX CARGO", "qepo", "pantalon", "baggy", "rigido", "negro", "plomo", "pantalon", "denim_qepo", "1-2-3-3-2", "denim"),
            ("CLASSIC V", "element", "polo", "slim", "comfort", "color", None, "polo", "polo_element", "2-3-3-2", "polo"),
            ("SPORT PRO", "element", "polo", "semipitillo", "stretch", "negro", None, "polo", "polo_element", "2-4-4-2", "polo"),
            ("URBAN JACKET", "element", "casaca", "semipitillo", "rigido", "negro", "plomo", "pantalon", "denim_element", "1-2-3-2-1", "denim"),
        ]

        for i, mdef in enumerate(modelo_defs):
            nombre, marca, tipo, entalle, tela, hilo, hilo_esp, ruta, linea, curva, ttype = mdef
            mid = str(uuid.uuid4())
            pt_id = str(uuid.uuid4())
            pt_code = f"PT-{i+1:03d}"

            await conn.execute(
                "INSERT INTO prod_inventario (id, codigo, nombre, categoria, unidad_medida, stock_actual, stock_minimo, empresa_id) VALUES ($1, $2, $3, 'PRODUCTO_TERMINADO', 'UND', 0, 0, 7)",
                pt_id, pt_code, f"{pt_code} - {nombre}")

            await conn.execute("""
                INSERT INTO prod_modelos (id, nombre, marca_id, tipo_id, entalle_id, tela_id, hilo_id, hilo_especifico_id, ruta_produccion_id, linea_negocio_id, pt_item_id)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            """, mid, nombre, MARCAS[marca], TIPOS[tipo], ENTALLES[entalle], TELAS[tela], HILOS[hilo],
                HILOS_ESP.get(hilo_esp), RUTAS[ruta], LINEAS[linea], pt_id)

            modelos.append({"id": mid, "nombre": nombre, "ruta": ruta, "linea": linea, "curva": curva, "ttype": ttype, "hilo_esp": HILOS_ESP.get(hilo_esp)})
            print(f"  {nombre} ({marca} / {tipo})")

        # ========== 4. Crear registros ==========
        print("\n=== Creando registros ===")
        hoy = date.today()
        registros_def = [
            # (n_corte, modelo_idx, estado_target, urgente, offset, tallas, entrega_days)
            ("001", 0, "Para Corte",         False, 0,   {"28":80,"30":120,"32":120,"34":80}, None),
            ("002", 1, "Corte",              False, -2,  {"28":60,"30":100,"32":100,"34":60,"36":40}, None),
            ("003", 2, "Costura",            True,  -5,  {"28":50,"30":80,"32":80,"34":50,"36":30}, 15),
            ("004", 0, "Bordado",            False, -8,  {"28":70,"30":100,"32":100,"34":70}, 20),
            ("005", 3, "Para Atraque",       False, -10, {"28":60,"30":90,"32":90,"34":60}, 12),
            ("006", 4, "Lavanderia",         True,  -12, {"28":40,"30":80,"32":100,"34":80,"36":40}, 8),
            ("007", 2, "Para Acabado",       False, -15, {"28":50,"30":70,"32":70,"34":50}, 5),
            ("008", 1, "Acabado",            False, -18, {"28":60,"30":90,"32":90,"34":60}, 3),
            ("009", 3, "Producto Terminado", False, -25, {"28":50,"30":80,"32":80,"34":50}, None),
            ("010", 5, "Estampado",          False, -6,  {"S":50,"M":80,"L":80,"XL":40}, 18),
            ("011", 6, "Costura",            True,  -9,  {"S":60,"M":100,"L":100,"XL":60}, 10),
            ("012", 5, "Para Aacabado",      False, -14, {"S":40,"M":60,"L":60,"XL":30}, 5),
            ("013", 7, "Para Lavanderia",    False, -11, {"28":30,"30":50,"32":50,"34":30,"36":20}, 10),
        ]

        registros = []
        for rdef in registros_def:
            n_corte, midx, estado, urgente, offset, tallas_cant, entrega_d = rdef
            m = modelos[midx]
            rid = str(uuid.uuid4())
            fc = hoy + timedelta(days=offset)
            fe = (hoy + timedelta(days=entrega_d)) if entrega_d else None
            td = TALLAS_DENIM if m["ttype"] == "denim" else TALLAS_POLO
            tallas_j = json.dumps([{"talla_id": td[t], "talla_nombre": t, "cantidad": c} for t, c in tallas_cant.items()])

            await conn.execute("""
                INSERT INTO prod_registros (id, empresa_id, n_corte, modelo_id, estado, urgente, curva, tallas,
                    fecha_creacion, fecha_entrega_final, hilo_especifico_id, linea_negocio_id, estado_operativo)
                VALUES ($1, 7, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, 'NORMAL')
            """, rid, n_corte, m["id"], estado, urgente, m["curva"], tallas_j, fc, fe, m["hilo_esp"], LINEAS[m["linea"]])

            for t_n, t_c in tallas_cant.items():
                await conn.execute(
                    "INSERT INTO prod_registro_tallas (id, registro_id, talla_id, cantidad_real, empresa_id) VALUES ($1, $2, $3, $4, 7)",
                    str(uuid.uuid4()), rid, td[t_n], t_c)

            total = sum(tallas_cant.values())
            registros.append({"id": rid, "n_corte": n_corte, "m": m, "estado": estado, "total": total, "fc": fc})
            print(f"  Corte {n_corte}: {m['nombre']:16s} → {estado:22s} ({total} prendas)")

        # ========== 5. Movimientos ==========
        print("\n=== Creando movimientos ===")
        cidx = 0
        for reg in registros:
            ruta = reg["m"]["ruta"]
            estado = reg["estado"]
            rid = reg["id"]
            total = reg["total"]
            fb = reg["fc"]
            estados_r = ESTADOS_PANTALON if ruta == "pantalon" else ESTADOS_POLO
            mov_map = MOV_PANTALON if ruta == "pantalon" else MOV_POLO

            if estado not in estados_r:
                continue
            target_i = estados_r.index(estado)
            day_off = 0

            for i, est in enumerate(estados_r):
                if i > target_i:
                    break
                if est not in mov_map:
                    continue

                serv_key, persona_key = mov_map[est]
                sid = SERVICIOS[serv_key]
                if persona_key:
                    pid = PERSONAS[persona_key]
                elif serv_key == "costura":
                    pid = PERSONAS[COSTUREROS[cidx % len(COSTUREROS)]]
                    cidx += 1
                elif serv_key == "estampado":
                    pid = PERSONAS["estampado_p"]
                elif serv_key == "atraque":
                    pid = PERSONAS["atraque_p"]
                else:
                    pid = PERSONAS["roger"]

                fi = fb + timedelta(days=day_off)
                day_off += random.randint(1, 3)
                completed = (i < target_i)
                in_progress = (est == estado and est in mov_map)

                merma = 0
                if completed and random.random() < 0.3:
                    merma = random.randint(2, 8)

                if in_progress:
                    avance = random.choice([30, 50, 60, 70, 80])
                    ff = None
                elif completed:
                    avance = 100
                    ff = fi + timedelta(days=random.randint(1, 3))
                else:
                    avance = 0
                    ff = None

                ce = total
                cr = (total - merma) if completed else total

                mov_id = str(uuid.uuid4())
                await conn.execute("""
                    INSERT INTO prod_movimientos_produccion (id, registro_id, servicio_id, persona_id,
                        fecha_inicio, fecha_fin, cantidad_enviada, cantidad_recibida, diferencia,
                        avance_porcentaje, tarifa_aplicada, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                """, mov_id, rid, sid, pid, fi, ff, ce, cr, merma, avance,
                    round(random.uniform(0.5, 3.0), 2), datetime.combine(fi, datetime.min.time()))

                if merma > 0 and completed:
                    await conn.execute("""
                        INSERT INTO prod_mermas (id, registro_id, movimiento_id, servicio_id, persona_id,
                            cantidad, motivo, fecha, tipo)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'FALTANTE')
                    """, str(uuid.uuid4()), rid, mov_id, sid, pid, merma,
                        random.choice(["Faltante en recepción", "Prendas extraviadas", "Diferencia de conteo"]), ff)

                tag = f"{'✓' if completed else '⟳'} {est} ({avance}%)"
                if merma > 0:
                    tag += f" merma:{merma}"
                print(f"    {reg['n_corte']}: {tag}")

        # ========== 6. Incidencias + Paralizaciones ==========
        print("\n=== Incidencias y Paralizaciones ===")
        motivos = await conn.fetch("SELECT id, nombre FROM prod_motivos_incidencia")
        if not motivos:
            for mn in ["Calidad", "Material defectuoso", "Demora excesiva", "Error de medida"]:
                mid = str(uuid.uuid4())
                await conn.execute("INSERT INTO prod_motivos_incidencia (id, nombre, activo) VALUES ($1, $2, true)", mid, mn)
            motivos = await conn.fetch("SELECT id, nombre FROM prod_motivos_incidencia")
        mot_ids = [dict(m) for m in motivos]
        now = datetime.now()

        # Paralizacion ACTIVA en reg 006
        r6 = registros[5]
        par_id = str(uuid.uuid4())
        await conn.execute("""
            INSERT INTO prod_paralizacion (id, empresa_id, registro_id, fecha_inicio, motivo, comentario, activa, created_at, updated_at)
            VALUES ($1, 7, $2, $3, 'Calidad', 'Prendas con manchas de lavado', true, $3, $3)
        """, par_id, r6["id"], now - timedelta(days=2))
        await conn.execute("""
            INSERT INTO prod_incidencia (id, empresa_id, registro_id, fecha_hora, usuario, tipo, comentario, estado, paraliza, paralizacion_id, created_at, updated_at)
            VALUES ($1, 7, $2, $3, 'eduard', $4, 'Manchas de lavado en lote completo', 'ABIERTA', true, $5, $3, $3)
        """, str(uuid.uuid4()), r6["id"], now - timedelta(days=2), mot_ids[0]["id"], par_id)
        await conn.execute("UPDATE prod_registros SET estado_operativo = 'PARALIZADA' WHERE id = $1", r6["id"])
        print(f"  Paralización ACTIVA: Corte {r6['n_corte']}")

        # Paralizacion RESUELTA en reg 004
        r4 = registros[3]
        par_id2 = str(uuid.uuid4())
        await conn.execute("""
            INSERT INTO prod_paralizacion (id, empresa_id, registro_id, fecha_inicio, fecha_fin, motivo, comentario, activa, created_at, updated_at)
            VALUES ($1, 7, $2, $3, $4, 'Material defectuoso', 'Hilo se rompía constantemente', false, $3, $4)
        """, par_id2, r4["id"], now - timedelta(days=5), now - timedelta(days=3))
        await conn.execute("""
            INSERT INTO prod_incidencia (id, empresa_id, registro_id, fecha_hora, usuario, tipo, comentario, estado, paraliza, paralizacion_id, created_at, updated_at)
            VALUES ($1, 7, $2, $3, 'eduard', $4, 'Hilo defectuoso cambiado', 'RESUELTA', true, $5, $3, $6)
        """, str(uuid.uuid4()), r4["id"], now - timedelta(days=5), mot_ids[1]["id"] if len(mot_ids)>1 else mot_ids[0]["id"], par_id2, now - timedelta(days=3))
        print(f"  Paralización RESUELTA: Corte {r4['n_corte']}")

        # Incidencia sin paralización en reg 011
        r11 = registros[10]
        await conn.execute("""
            INSERT INTO prod_incidencia (id, empresa_id, registro_id, fecha_hora, usuario, tipo, comentario, estado, paraliza, created_at, updated_at)
            VALUES ($1, 7, $2, $3, 'eduard', $4, 'Demora en entrega de corte', 'ABIERTA', false, $3, $3)
        """, str(uuid.uuid4()), r11["id"], now - timedelta(days=1), mot_ids[2]["id"] if len(mot_ids)>2 else mot_ids[0]["id"])
        print(f"  Incidencia sin paralización: Corte {r11['n_corte']}")

        # ========== 7. Fallados y Arreglos ==========
        print("\n=== Fallados y Arreglos ===")
        r8 = registros[7]  # Acabado
        fid = str(uuid.uuid4())
        await conn.execute("""
            INSERT INTO prod_fallados (id, registro_id, servicio_detectado_id, cantidad_detectada, cantidad_reparable, cantidad_no_reparable,
                destino_no_reparable, motivo, fecha_deteccion, estado, observaciones)
            VALUES ($1, $2, $3, 15, 10, 5, 'LIQUIDACION', 'Costuras desalineadas en pretina', $4, 'EN_PROCESO', 'Detectado en acabado')
        """, fid, r8["id"], SERVICIOS["costura"], hoy - timedelta(days=1))
        await conn.execute("""
            INSERT INTO prod_arreglos (id, fallado_id, registro_id, cantidad_enviada, tipo, servicio_destino_id, persona_destino_id,
                fecha_envio, fecha_limite, estado, motivo)
            VALUES ($1, $2, $3, 10, 'ARREGLO_EXTERNO', $4, $5, $6, $7, 'PENDIENTE', 'Recoser pretina')
        """, str(uuid.uuid4()), fid, r8["id"], SERVICIOS["costura"], PERSONAS["carlos"],
            hoy - timedelta(days=1), hoy + timedelta(days=2))
        print(f"  Fallado EN_PROCESO: Corte {r8['n_corte']} (15 prendas, 10 en arreglo)")

        r7 = registros[6]  # Para Acabado
        fid2 = str(uuid.uuid4())
        await conn.execute("""
            INSERT INTO prod_fallados (id, registro_id, servicio_detectado_id, cantidad_detectada, cantidad_reparable, cantidad_no_reparable,
                destino_no_reparable, motivo, fecha_deteccion, estado)
            VALUES ($1, $2, $3, 8, 8, 0, 'PENDIENTE', 'Ojal mal posicionado', $4, 'CERRADO')
        """, fid2, r7["id"], SERVICIOS["atraque"], hoy - timedelta(days=5))
        await conn.execute("""
            INSERT INTO prod_arreglos (id, fallado_id, registro_id, cantidad_enviada, cantidad_resuelta, cantidad_no_resuelta,
                tipo, servicio_destino_id, persona_destino_id, fecha_envio, fecha_limite, fecha_retorno, resultado_final, estado, motivo)
            VALUES ($1, $2, $3, 8, 7, 1, 'ARREGLO_EXTERNO', $4, $5, $6, $7, $8, 'BUENO', 'RESUELTO', 'Reposicionar ojales')
        """, str(uuid.uuid4()), fid2, r7["id"], SERVICIOS["atraque"], PERSONAS.get("atraque_p", PERSONAS["roger"]),
            hoy - timedelta(days=5), hoy - timedelta(days=2), hoy - timedelta(days=3))
        print(f"  Fallado CERRADO: Corte {r7['n_corte']} (8 prendas, 7 reparadas)")

        # ========== 8. Colores ==========
        print("\n=== Colores ===")
        color_keys_list = list(COLORES.keys())
        for reg in registros[:6]:
            td = TALLAS_DENIM if reg["m"]["ttype"] == "denim" else TALLAS_POLO
            ck = random.sample(color_keys_list, 2)
            trows = await conn.fetch("SELECT talla_id, cantidad_real FROM prod_registro_tallas WHERE registro_id = $1", reg["id"])
            dist = []
            for tr in trows:
                tot = tr["cantidad_real"]
                h = tot // 2
                tname = next((k for k, v in td.items() if v == tr["talla_id"]), "?")
                dist.append({
                    "talla_id": tr["talla_id"], "talla_nombre": tname, "cantidad_total": tot,
                    "colores": [
                        {"color_id": COLORES[ck[0]], "color_nombre": ck[0].replace("_", " ").title(), "cantidad": h},
                        {"color_id": COLORES[ck[1]], "color_nombre": ck[1].replace("_", " ").title(), "cantidad": tot - h},
                    ]
                })
            await conn.execute("UPDATE prod_registros SET distribucion_colores = $1::jsonb WHERE id = $2", json.dumps(dist), reg["id"])
        print("  Colores asignados a 6 registros")

        # ========== 9. Estado operativo ==========
        print("\n=== Estados operativos ===")
        for reg in registros:
            if reg["estado"] == "Producto Terminado":
                continue
            rid = reg["id"]
            par_act = await conn.fetchval("SELECT COUNT(*) FROM prod_paralizacion WHERE registro_id = $1 AND activa = true", rid)
            if par_act > 0:
                await conn.execute("UPDATE prod_registros SET estado_operativo = 'PARALIZADA' WHERE id = $1", rid)
            else:
                rr = await conn.fetchrow("SELECT fecha_entrega_final FROM prod_registros WHERE id = $1", rid)
                if rr and rr["fecha_entrega_final"]:
                    dias = (rr["fecha_entrega_final"] - hoy).days
                    if dias <= 3:
                        await conn.execute("UPDATE prod_registros SET estado_operativo = 'EN_RIESGO' WHERE id = $1", rid)

        # ========== RESUMEN ==========
        print("\n" + "=" * 60)
        counts = {}
        for t in ["prod_modelos", "prod_registros", "prod_movimientos_produccion", "prod_mermas", "prod_incidencia", "prod_paralizacion", "prod_fallados", "prod_arreglos"]:
            counts[t] = await conn.fetchval(f"SELECT COUNT(*) FROM {t}")
        print("RESUMEN FINAL:")
        for k, v in counts.items():
            print(f"  {k}: {v}")
        print("=" * 60)

    await pool.close()

asyncio.run(main())
