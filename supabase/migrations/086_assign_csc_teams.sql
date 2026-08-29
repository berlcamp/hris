-- CSC anniversary team assignments for the 949 people who matched a record.
--
-- Straight from employees_with_teams.xlsx, which carries the record ID for
-- every row, so each assignment is keyed on the primary key rather than on a
-- name. That is the whole reason this file is safe to run: no name matching,
-- no ambiguity between two people called Zamora, no rows touched by accident.
--
-- An id that no longer exists simply updates nothing — UPDATE ... FROM drops
-- unmatched rows on the join. The counts at the bottom of each statement are
-- what to check against: 660 plantilla, 256 Job Order, 33 COS.
--
-- Re-runnable: setting the same team twice is the same as setting it once.

SET search_path TO hris, public, auth, extensions;

-- ── Plantilla — 660 people ─────────────────────────────────────
UPDATE hris.employees AS t
SET csc_team = v.csc_team
FROM (VALUES
    ('5837918b-88c3-427b-8b50-3dfb5d191968'::uuid, 'Group 7 - Purple Peacocks'::text),  -- ACAPULCO, PERLA CARREON
    ('eac0d73f-4784-4870-b5df-df93b7ad54bd'::uuid, 'Group 3 - Yellow Vipers'),  -- CENTILLAS, SOLAMETE DELOS SANTOS
    ('633de7c2-d2fc-4087-a60a-630024031180'::uuid, 'Group 5 - Blue Sharks'),  -- MAQUILING, EMMANUEL MANTE
    ('fd5e173e-4eb7-402e-b568-ef74e0754b90'::uuid, 'Group 8 - Orange Tigers'),  -- ROSAURO, Ma. ARLENE LISONDRA
    ('6f5957ca-df9f-4a52-8c3e-59570f8cb1ef'::uuid, 'Group 8 - Orange Tigers'),  -- OBINA, ARMI CORA FLOR SANCHEZ
    ('b3eeadc9-e4f9-4d10-a056-709f92c1f7a0'::uuid, 'Group 1 - White Rhinos'),  -- BUTALID, GIL DELOS SANTOS
    ('665354e1-fc1f-49ae-a103-87a94885c742'::uuid, 'Group 4 - Gray Wolves'),  -- CORTES, GENEVIEVE ZOSIMA REQUILME
    ('2020dbec-50d0-4c61-9db2-004b5100d97c'::uuid, 'Group 5 - Blue Sharks'),  -- BAYA, JEROME CABANDO
    ('7a5e964c-53d5-4fa7-bc90-e9772ccd6d3e'::uuid, 'Group 8 - Orange Tigers'),  -- SULASULA, VILMA MALBUYO
    ('53c1db8a-187d-4666-a4bf-f089c02bc674'::uuid, 'Group 3 - Yellow Vipers'),  -- SEPE, DAISY REBUTAZO
    ('29925227-6e52-4cb6-9623-f5099d6b8d27'::uuid, 'Group 4 - Gray Wolves'),  -- DUMPOR, ALMA PALANG
    ('5d64abe0-0b46-4513-9d36-66f6ddb7e35a'::uuid, 'Group 4 - Gray Wolves'),  -- SINGH, PAUL ABTAR MACASIEB
    ('ac689c5d-69d6-4081-8394-401034dd056e'::uuid, 'Group 7 - Purple Peacocks'),  -- LABAJO, MA. VICTORIA ORTEGA
    ('00cf5d2b-e106-4c13-a0f1-5af1b3166207'::uuid, 'Group 5 - Blue Sharks'),  -- CAILING, ROSEMARIE SAN DIEGO
    ('4a0f8f8a-5e46-47b6-9090-45a3b35e17c2'::uuid, 'Group 7 - Purple Peacocks'),  -- CA&#209;ONAZO, REBECCA MACAN
    ('615a62a6-54e5-4842-80c5-18d4c04138fd'::uuid, 'Group 5 - Blue Sharks'),  -- ROA, ALMA COMONSAD
    ('286ce43f-6c73-4326-bdb8-78102beb5df0'::uuid, 'Group 1 - White Rhinos'),  -- SONOGAN, AL RYAN ENGRACIA
    ('7f7d03f8-ec19-472b-afa7-9c5fe81519d5'::uuid, 'Group 6 - Red Foxes'),  -- REGIS, MAHJALLA MAY ARTAJO
    ('0a018f6a-514d-4fc3-8f15-84ee63887124'::uuid, 'Group 3 - Yellow Vipers'),  -- MEJARES, REAGAN BIJASA
    ('67407924-bcac-4ec8-8e13-88f6af74e35c'::uuid, 'Group 1 - White Rhinos'),  -- LAMBAN, MARITES GONZAGA
    ('e571d074-645c-4f35-bd6d-6a6ed59b34d8'::uuid, 'Group 7 - Purple Peacocks'),  -- ABEJUELA, TERESA PENIERO
    ('3440d2db-7a08-46a6-904c-7c550c097413'::uuid, 'Group 2 - Pink Flamingos'),  -- ROSAL, AMCHELL RAY LLANOS
    ('72d01246-c244-4e8e-b407-c6dd3f836b2b'::uuid, 'Group 7 - Purple Peacocks'),  -- OCDOL, MARY JOY NATIVIDAD CORTES
    ('0edc7965-f056-4da0-8724-e4099884bae4'::uuid, 'Group 6 - Red Foxes'),  -- ASIDOR, JESSY MAE BACASNOT
    ('ca998e7a-027d-4573-8f1c-b521e68189a7'::uuid, 'Group 8 - Orange Tigers'),  -- DANAOTO, JEANA TORRES
    ('4b5b36cc-2c6b-4888-ae87-02e25a1290d7'::uuid, 'Group 2 - Pink Flamingos'),  -- PACANA, ADOLF PANTONIAL
    ('53dcb576-5746-4812-aa16-0912024f4f6b'::uuid, 'Group 2 - Pink Flamingos'),  -- FLORENDO, JONAGEN WACAN
    ('37a75939-38b0-43c2-9248-283542386967'::uuid, 'Group 7 - Purple Peacocks'),  -- ENGRACIA, RENE BOY ALBURO
    ('c5605262-6d4c-4a9a-b836-0b856d0d9ce9'::uuid, 'Group 2 - Pink Flamingos'),  -- MAGDADARO, MARIA KINATAC-AN
    ('2bcb0c50-c131-41a4-a9cb-b297c7505cb1'::uuid, 'Group 7 - Purple Peacocks'),  -- HYNSON, BETTY ACAPULCO
    ('7364f7cb-e26d-43f5-aa6d-6c2b87fd2567'::uuid, 'Group 3 - Yellow Vipers'),  -- PALAD, LUCY CHRISTINA MABANAG
    ('b617d116-476a-496d-8a3e-b1cd049e16a9'::uuid, 'Group 1 - White Rhinos'),  -- MECAROS, BERNARDETTE LAGUNA
    ('96aa1c83-39be-47da-a21f-93776b864d9b'::uuid, 'Group 1 - White Rhinos'),  -- LAGUS, NOLAN GERALDIZO
    ('9248e343-c73a-4dee-a7cc-3594d69a6a1c'::uuid, 'Group 7 - Purple Peacocks'),  -- POTESTAS, CLINT DONALD VIOVICENTE
    ('b6e9a63c-8a2b-49a1-abfc-91fa5e95be9c'::uuid, 'Group 2 - Pink Flamingos'),  -- CUABO, EDEN ARANIEGO
    ('248467fa-b53c-4ef0-bff5-67d4b3135e9e'::uuid, 'Group 2 - Pink Flamingos'),  -- NILLAMA, ANDY ALCORDO
    ('5f6a0c0e-5209-42dc-890d-5495c4d78f55'::uuid, 'Group 7 - Purple Peacocks'),  -- DUMPOR, REMA SAAVEDRA
    ('e4f1138b-f0be-489c-ba2a-a79cb9b515e4'::uuid, 'Group 3 - Yellow Vipers'),  -- ALBURO, NAOMI ANTEPUESTO
    ('8945e783-475f-49f4-aebe-2fb30f7861b3'::uuid, 'Group 6 - Red Foxes'),  -- ADENIR, NANCY OCAPAN
    ('2f686061-71a3-4e86-b8e8-857f51f7d86d'::uuid, 'Group 7 - Purple Peacocks'),  -- ALMONIA, LILIBETH ANGELIO
    ('a4c9ca3a-eafd-4dfb-b7b2-f8c22ccef515'::uuid, 'Group 7 - Purple Peacocks'),  -- TIGLEY, MARCELO
    ('b3835b87-c9fe-4c11-a716-1b4bc2cbcec5'::uuid, 'Group 8 - Orange Tigers'),  -- LUMAYAGA, JASMIN LEE RIVERA
    ('6f97d596-946c-4816-a7a1-733a454bf7b2'::uuid, 'Group 7 - Purple Peacocks'),  -- BENDIJO, NOLAN JOHN SAMONTE
    ('c6da295e-c539-401b-8d11-aab9f61d3d4c'::uuid, 'Group 6 - Red Foxes'),  -- CARALE, WINNIE TAN
    ('c5da4281-8a28-43cd-8ed7-49481dde35f8'::uuid, 'Group 2 - Pink Flamingos'),  -- VELAYO, BILLY DELA VEGA
    ('c87b4788-bead-466e-8e11-b26f791feaf1'::uuid, 'Group 3 - Yellow Vipers'),  -- ACAPULCO, ARVIN PRONTES
    ('76434739-14d1-442d-b73b-967598029369'::uuid, 'Group 8 - Orange Tigers'),  -- EMPERIO, KLEANOURE CYREL RAMAYRAT
    ('302bd204-18b8-4634-8996-6bf7e651f249'::uuid, 'Group 1 - White Rhinos'),  -- ENOMAR, ANNA JILL DELOS SANTOS
    ('6eaa3306-2ec7-4c0e-b47e-33195b3682c4'::uuid, 'Group 1 - White Rhinos'),  -- ADLAWON, JOEL MURALLON
    ('49194697-511a-4feb-a27d-7b5dcb1175a4'::uuid, 'Group 7 - Purple Peacocks'),  -- BADAL, MONICA CHARITO CHU
    ('6b4126ec-a4b3-4578-a386-39c21aed3854'::uuid, 'Group 4 - Gray Wolves'),  -- ABELLA, ROBERT STEPHEN CABAITAN
    ('fe9b03ac-6f35-433e-9a7d-d7ebbac55f5d'::uuid, 'Group 8 - Orange Tigers'),  -- LIBATOG, RODOLFO PAULINO
    ('77775173-c19c-462d-9b6d-b0b5a777c2e6'::uuid, 'Group 8 - Orange Tigers'),  -- RADORES, ANALYN DENAGA
    ('9633a9ee-fbdf-4810-ba78-deb820fdb72e'::uuid, 'Group 8 - Orange Tigers'),  -- SISO, GANNY BOLAY-OG
    ('05af4423-79e5-4579-a81e-ec13e7726abc'::uuid, 'Group 2 - Pink Flamingos'),  -- ALNGOHORO, REBECCA MIANO
    ('44a9b972-7734-4d96-81f4-7717df5287a8'::uuid, 'Group 3 - Yellow Vipers'),  -- DELA CERNA, RODOLFO TERADO
    ('bb0118e2-b87e-4a0c-8143-81f4fd4385c6'::uuid, 'Group 6 - Red Foxes'),  -- GUANGCO, RICO MIRABUENO
    ('9aab76c3-48ae-407f-b0af-b6eb35212f1c'::uuid, 'Group 7 - Purple Peacocks'),  -- FUENTES, JAY MACAS
    ('6d8012ec-350e-4b6d-ade4-447bc0c2da23'::uuid, 'Group 4 - Gray Wolves'),  -- DOCDOR, JOHN PAMAYLOAN
    ('a19f9769-cc55-4914-b8dc-e7ae2c9e471b'::uuid, 'Group 5 - Blue Sharks'),  -- ABUCAY, CARMELITA PAMAYLAON
    ('272d7615-9e74-47d4-b2a2-d8139540164b'::uuid, 'Group 6 - Red Foxes'),  -- BADONG, MARIE THERESE OGSIMER
    ('bc236868-3b70-4b2e-aad0-88f860e7c360'::uuid, 'Group 6 - Red Foxes'),  -- GORNEZ, FLOREPEN DIAZ
    ('9a26ce50-39b9-48b4-b973-853e9ff7b047'::uuid, 'Group 7 - Purple Peacocks'),  -- BULAO, JUDITH LAGROSAS
    ('29b0b1c6-6bc7-4ddf-8685-57df60edab8d'::uuid, 'Group 7 - Purple Peacocks'),  -- FRANCISCO, EDGAR EDILO
    ('802d55e3-b9e2-4af8-960e-f826889291cc'::uuid, 'Group 6 - Red Foxes'),  -- TANCOGO, VICENTE DAYO
    ('ae8f58c8-7b4f-4dac-95a0-9385ee691069'::uuid, 'Group 2 - Pink Flamingos'),  -- TEMORCINA, HERENERIO MARIO PUSOD
    ('bb6087d6-a3f6-42d4-bff2-1f3f982fe856'::uuid, 'Group 3 - Yellow Vipers'),  -- PADILLA, EDUARDO JR. CA&#209;ETE
    ('41951ce6-aa25-42be-a436-bbbb866c139a'::uuid, 'Group 3 - Yellow Vipers'),  -- APAO, LOREFIE CAYANPAT
    ('9faac1bd-154d-4e4a-ba82-6b39b5a8ae53'::uuid, 'Group 7 - Purple Peacocks'),  -- SUMATRA, EDGAR SANICO
    ('df2d8bd5-9ea5-42a5-b05c-1505a4114bc1'::uuid, 'Group 1 - White Rhinos'),  -- MINQUE, ELCID CABRERA
    ('6355cb10-c977-42d3-8136-c2ddfa00dd05'::uuid, 'Group 6 - Red Foxes'),  -- BALIDOY, MARJORIE DUMAOG
    ('48c08d46-92d9-453c-8eb3-2196facd7741'::uuid, 'Group 1 - White Rhinos'),  -- CONOL, JEFFERSON PINTACASI
    ('f6dd7b65-5e91-444b-8b6d-97c4709416d4'::uuid, 'Group 1 - White Rhinos'),  -- ABA, JEAN AGUM
    ('6a72eda9-2d9d-4030-b9ed-a142dfe6203f'::uuid, 'Group 6 - Red Foxes'),  -- AGOT, MARY GRACE ERQUITA
    ('539c6f28-b4e9-48c1-9049-65afc0ed7f13'::uuid, 'Group 1 - White Rhinos'),  -- BENAVENTE, RONALD CARBAJAL
    ('ca00b639-44ce-46bc-90cb-59f85a41f7c8'::uuid, 'Group 7 - Purple Peacocks'),  -- PURGATORIO, JANGERRY SOSAS
    ('96107624-f03f-4d7b-891b-9169ab0283ed'::uuid, 'Group 4 - Gray Wolves'),  -- CHINCHONTIC, LUZMINDA CARUMBA
    ('1964a4b7-1644-487c-acf0-ed6fef039205'::uuid, 'Group 4 - Gray Wolves'),  -- FRIOLO, JUNIFER CA&#209;O
    ('1e4e2cd2-83ea-4cbb-acad-2f4946e45fe5'::uuid, 'Group 1 - White Rhinos'),  -- TUBAYAN, IRIS MAE ANG
    ('f1d7d696-7216-4624-87bd-560903cd5a30'::uuid, 'Group 7 - Purple Peacocks'),  -- FONTE, ALEXANDER DAMALERIO
    ('07fdd7ed-cf3a-4ff0-81ca-c83e5c03e4a7'::uuid, 'Group 1 - White Rhinos'),  -- FUENTES, DESIREE ESTORHIYO
    ('12312f86-0bbc-4277-8786-65dc076fcfcf'::uuid, 'Group 7 - Purple Peacocks'),  -- JUSTINIANE, ELMO ABAPO
    ('488b2c0c-333f-4147-9a49-4412c50933d3'::uuid, 'Group 4 - Gray Wolves'),  -- RONULO, MARK JONSON LUMBRA
    ('32f889e8-2346-4f56-8c18-7d92542db8be'::uuid, 'Group 8 - Orange Tigers'),  -- GONZALES, CHARLES LAGAHIT
    ('da7d26b5-efbd-4859-864c-ec39e9e9de93'::uuid, 'Group 1 - White Rhinos'),  -- ORIGENES, AGNES OBINA
    ('af2ab7b6-c332-4e8b-8cf4-a364f59b1611'::uuid, 'Group 1 - White Rhinos'),  -- REYES, ROSENDO QUIMNO
    ('7ca4bb8c-0f10-4e14-b078-f59e61ba1e5f'::uuid, 'Group 4 - Gray Wolves'),  -- ARCAMO, MAICO PACE
    ('6412f5b2-48f6-4b19-9834-726ee2477014'::uuid, 'Group 2 - Pink Flamingos'),  -- MAABA, ARLENE PAGUICAN
    ('4c054159-d69e-4347-9134-4a6d993ae876'::uuid, 'Group 5 - Blue Sharks'),  -- BALATERO, CRISBEL PENONIA
    ('5810d544-fd12-486c-91f2-b2a00a4f4da5'::uuid, 'Group 8 - Orange Tigers'),  -- MADRID, LUCY MAGHANOY
    ('6fb1cba8-11cc-4608-88ff-a9c8d91b33a7'::uuid, 'Group 1 - White Rhinos'),  -- SISON, REGAN PE&#209;AFUERTE
    ('ea86d1f3-e5ca-4bcc-9bba-f970e2790015'::uuid, 'Group 6 - Red Foxes'),  -- BAJADA, JOCELYN OGA
    ('8d041ddb-ad7c-46ae-ba9e-29df4e3e6c01'::uuid, 'Group 2 - Pink Flamingos'),  -- DENSING, LEMUEL TILAO
    ('128eb6f0-655c-45da-a7d6-79ab819d0c29'::uuid, 'Group 7 - Purple Peacocks'),  -- ESPENIDO, ARMAN OZAMIZ
    ('4b5bdc8f-672e-4569-870c-7c990a703b5d'::uuid, 'Group 4 - Gray Wolves'),  -- FRANCISCO, ARNOLD ROA
    ('09d4ccb2-c846-4895-8d24-c1b480ce1ffd'::uuid, 'Group 6 - Red Foxes'),  -- HALASAN, JUDITH RAFAYLA
    ('aa6487b5-ca26-4301-a95a-d2ea3522625c'::uuid, 'Group 1 - White Rhinos'),  -- MABANAG, SARAH ARSENAL
    ('8ea3fe7d-58ea-487e-8c19-b7e897cd40cf'::uuid, 'Group 1 - White Rhinos'),  -- PACALIOGA, NEIL TOLEDO
    ('c009e27e-7c57-458b-b8bc-38926b5a9f5a'::uuid, 'Group 2 - Pink Flamingos'),  -- BALCITA, BENZENE LASMARIAS
    ('47a3972d-52f3-4913-bd61-22df940b0a2d'::uuid, 'Group 7 - Purple Peacocks'),  -- PASOK, EUGENE VON MANAGO
    ('c7e7c845-ee4d-4387-ab3c-6f50bb0c4dfc'::uuid, 'Group 5 - Blue Sharks'),  -- ROA, GLORIA ROBLE
    ('0023c2a3-c8dd-4b1f-b2b3-7cdee7e21936'::uuid, 'Group 7 - Purple Peacocks'),  -- SALIG, LILIA DIAZ
    ('19c03a9b-f3ff-4611-b14f-a324ab4c9872'::uuid, 'Group 6 - Red Foxes'),  -- CELADA, RODRIGO ABAYON
    ('29c86fde-5203-4c92-b25d-b153f0a0bc2a'::uuid, 'Group 3 - Yellow Vipers'),  -- GO, CAROLYN NAGAL
    ('f1f73b56-513b-4fec-96e5-35ab15c894ed'::uuid, 'Group 5 - Blue Sharks'),  -- LIM, RINO KARLO GO
    ('5e35df47-0e9e-4920-8cda-f0121260b170'::uuid, 'Group 2 - Pink Flamingos'),  -- PAREDES, MARIA CLEOPE OZAMIZ
    ('c98fe856-d9de-44e8-a981-80d23ed9972c'::uuid, 'Group 2 - Pink Flamingos'),  -- QUIAP, DANILO PABELLARAN
    ('08115cac-988c-4a5e-b53d-20e422b2684b'::uuid, 'Group 4 - Gray Wolves'),  -- TECSON, DAZIELLE JUMUAD
    ('1d287378-b22f-4b41-8a79-26cd1e157158'::uuid, 'Group 7 - Purple Peacocks'),  -- AMPONG, EVELYN PUGOY
    ('3f282e94-f91f-4a0f-b757-eb86803ba52e'::uuid, 'Group 7 - Purple Peacocks'),  -- BALUNDO, RYAN ACAPULCO
    ('57a83408-de9f-4c98-b3ad-f8709771cea0'::uuid, 'Group 1 - White Rhinos'),  -- BORBON, EMMA TUASTOMBAN
    ('aff213fc-3ee1-4c3c-8839-55557a0b0500'::uuid, 'Group 7 - Purple Peacocks'),  -- CHIONG, WINNE LOVE OTERO
    ('f1d05c72-b90d-43b3-bf3d-3f93849bb4e7'::uuid, 'Group 1 - White Rhinos'),  -- DATULAYTA, CECILE GERALDE
    ('f64fc705-6769-464b-a0e5-2340f84b451f'::uuid, 'Group 8 - Orange Tigers'),  -- ESTOMATA, AMALIA GARCIA
    ('da75c9f8-8e53-414c-947e-e2c8fbdc7c92'::uuid, 'Group 1 - White Rhinos'),  -- LARGO, BONNIE CLARK CAJOTE
    ('d9ebe3e2-fe51-4ddc-9ef2-4d4d310438b9'::uuid, 'Group 4 - Gray Wolves'),  -- LAURETE, NATHAN RAYOSO
    ('3484e096-2ec1-4f46-8236-dbab51ad73f2'::uuid, 'Group 3 - Yellow Vipers'),  -- PACTOLIN, JO ANNE CLARE RATILLA
    ('120f4053-7a0f-4468-8e70-78477402800e'::uuid, 'Group 3 - Yellow Vipers'),  -- TAMPARONG, FERDINAND BUGSOCAN
    ('7424242b-b72e-4382-bef4-1b57422ca7d1'::uuid, 'Group 7 - Purple Peacocks'),  -- GACASAN, KIMBERLY GINOS
    ('49e7d511-9b12-408d-8923-85899fd7ade4'::uuid, 'Group 4 - Gray Wolves'),  -- PARO-AN, JOMILLA ANN DUMAGAN
    ('e00d1d2a-de12-46d5-b9c6-bfbd853c938e'::uuid, 'Group 3 - Yellow Vipers'),  -- DAHUNAN, ERDY AGAD
    ('25dbb628-b11f-4752-8404-69a9b9051fab'::uuid, 'Group 2 - Pink Flamingos'),  -- ALICAYA, ANTONIO CA&#209;AMO
    ('df17bacd-dcea-4f6e-bf61-1c9b6f20499a'::uuid, 'Group 5 - Blue Sharks'),  -- AMANTE, AL NORCA
    ('0ec28c79-2cce-4d84-b78a-9a568019c663'::uuid, 'Group 3 - Yellow Vipers'),  -- ANISLAG, PATRICK ENGRACIA
    ('16c2139a-7927-4c88-93ea-57c8127a9737'::uuid, 'Group 5 - Blue Sharks'),  -- HILAGA, MARLITO CHAVEZ
    ('74910527-8cb9-4e71-91bc-829ffe850a22'::uuid, 'Group 7 - Purple Peacocks'),  -- JABIAN, CARLEEN DIMAANO
    ('89a111fd-855e-42b5-b808-55e60115ed19'::uuid, 'Group 4 - Gray Wolves'),  -- APAT, ANTONIO GAUDIANO
    ('3b63cf73-48f2-41b5-ab27-704d8de1b1fb'::uuid, 'Group 3 - Yellow Vipers'),  -- LABE, BOBBIE RANDY ORDENIZA
    ('0ca8aa23-2b8d-4208-9395-c3b45a905676'::uuid, 'Group 4 - Gray Wolves'),  -- LAREDO, JUDY GRACE LAMBIQUIT
    ('07484578-80b0-467b-a31a-6884d6280ed7'::uuid, 'Group 5 - Blue Sharks'),  -- LUCE&#209;ADA, REYNALDO GALILI
    ('ce2b7399-f3f2-45fa-a628-fb18ad19c2b4'::uuid, 'Group 4 - Gray Wolves'),  -- MACARAYO, DEXTER GARNADA
    ('c7d15af3-95bd-42be-846c-70208e6a667a'::uuid, 'Group 7 - Purple Peacocks'),  -- MAGLINTE, NOREEN UDARVE
    ('893f14ae-af0b-44ae-adad-d709f525f84e'::uuid, 'Group 2 - Pink Flamingos'),  -- MEJARES, RODOLFO DELA VICTORIA
    ('6a3f0ef2-9f35-4f9b-b0fe-b7dfb5792500'::uuid, 'Group 4 - Gray Wolves'),  -- OCLARET, ROLANDO CAMPOS
    ('0aa58cc2-dbd9-4e39-b526-b46103d46605'::uuid, 'Group 8 - Orange Tigers'),  -- PACTO, JORLAN REPITA
    ('918cb853-d31f-4c97-b81d-86aa092a7183'::uuid, 'Group 8 - Orange Tigers'),  -- PALANAS, ROSALINDA CAPUNO
    ('490ca224-6e52-4104-a9f9-6a5dca1aebc9'::uuid, 'Group 4 - Gray Wolves'),  -- MONTEFALCON, RICO DOLIGUEZ
    ('ac3f6917-f08e-4dd0-881d-f159637c7754'::uuid, 'Group 8 - Orange Tigers'),  -- RAMAS, FRANCISCO REDOBLADO
    ('ab15f147-62e0-4b00-a759-61289a5f0c61'::uuid, 'Group 6 - Red Foxes'),  -- REDOBLADO, ARCADIO RUBIO
    ('b810a622-c143-4904-a635-72684d6302f5'::uuid, 'Group 1 - White Rhinos'),  -- SISMONDO, JOSIEPHINE MANGINSAY
    ('1b78db1e-3b31-4006-a1a9-9b4ba8d936d4'::uuid, 'Group 1 - White Rhinos'),  -- TOMADA, RONY FUENTES
    ('f93e155b-042e-42a7-af08-647cccd73096'::uuid, 'Group 4 - Gray Wolves'),  -- TOMADA, VERNA INDIC
    ('759dbc20-cf88-4af7-9100-f23e0edb6676'::uuid, 'Group 8 - Orange Tigers'),  -- VISITACION, GINA REGIS
    ('e1ab2701-adfb-48a0-96e3-25cb929406a2'::uuid, 'Group 8 - Orange Tigers'),  -- NAVAREZ, LELITA GALLO
    ('cc050317-84b1-4c33-bdc1-3ee4cfca5c25'::uuid, 'Group 2 - Pink Flamingos'),  -- ALICAYA, MARY-AN GUMIMBA
    ('15bd61d7-3c6e-451a-8409-99296b655953'::uuid, 'Group 2 - Pink Flamingos'),  -- FLORIDA, ROSALENE MAREQUITA
    ('f6b4b59b-fc03-4c1a-a52a-d4ae4804631e'::uuid, 'Group 5 - Blue Sharks'),  -- BALAT, JACKY LOU DANAOTO
    ('9f9111a0-71e8-4154-bf42-65e263450539'::uuid, 'Group 3 - Yellow Vipers'),  -- BARAYA, FELIPE BADELLES
    ('b3d39c0a-4053-4642-8d48-40a234903277'::uuid, 'Group 1 - White Rhinos'),  -- BATION, ROGER MEDINA
    ('decfc53b-bea8-4e79-9a0e-849f8cc9e683'::uuid, 'Group 5 - Blue Sharks'),  -- COSIP, EDUARDO OMPOCO
    ('b881d1e2-1937-460a-b535-4a8600f4409c'::uuid, 'Group 8 - Orange Tigers'),  -- LAURETE, QUENIE FILIPINO
    ('cade2ab7-1cca-47e7-8066-d7b9ff046b3e'::uuid, 'Group 7 - Purple Peacocks'),  -- DALAYGON, MARYLYN NU&#209;EZA
    ('7d9183b4-5a6e-46c2-9194-be8abc189cd8'::uuid, 'Group 1 - White Rhinos'),  -- POTUTAN, JOB PABATAN
    ('879b4aa6-93e4-4598-a57a-ac54b9de6cf8'::uuid, 'Group 2 - Pink Flamingos'),  -- GO, CHARLSTON LIM
    ('d6df3843-24da-41b1-a549-9a413b992409'::uuid, 'Group 3 - Yellow Vipers'),  -- INCISO, MARLON ARBIS
    ('c2201d7a-dec0-4278-be83-2d2ed91fd08b'::uuid, 'Group 6 - Red Foxes'),  -- LANGOYAN, MARY JANE DETALLA
    ('65f9ce89-204b-46f1-83ba-1c0064174f1f'::uuid, 'Group 4 - Gray Wolves'),  -- LAURETE, AMY SHEILA FERENAL
    ('b149283a-0cb1-44db-85e3-fabb098f9af4'::uuid, 'Group 5 - Blue Sharks'),  -- LEONARDO, EDGAR BODIONGAN
    ('634f015e-40b0-4511-9f2a-a86f00865e46'::uuid, 'Group 2 - Pink Flamingos'),  -- OGA, RAUL TOMADA
    ('14e083e0-f353-4bd6-a178-ad257190121a'::uuid, 'Group 1 - White Rhinos'),  -- PARI&#209;AS, SARAH PACLIPAN
    ('1d0b0e19-b8ab-4dd3-83c3-16135a3969db'::uuid, 'Group 6 - Red Foxes'),  -- PEROLINO, ESTER MERCADO
    ('b1565c76-2087-45c1-a107-03d42cbc1b50'::uuid, 'Group 5 - Blue Sharks'),  -- PUGOY, EDELRONA CABURAO
    ('c2e9d82d-33cf-4f16-9306-4df2f13690a8'::uuid, 'Group 5 - Blue Sharks'),  -- PUTOL, MARIA ARNECHIE MATALINES
    ('8081f3f2-63b5-4b91-8eb4-d5304cea9bbe'::uuid, 'Group 5 - Blue Sharks'),  -- SAQUIN, KRISTO JACK BALCITA
    ('6258b4f3-f774-41a9-b01d-1ade90e867b8'::uuid, 'Group 3 - Yellow Vipers'),  -- TAGALOG, CHRISTOPHER CA&#209;IZARES
    ('26919ec4-23ba-4a1a-a9e9-f9467fa98f3c'::uuid, 'Group 5 - Blue Sharks'),  -- TARE, EMIE LAPIZ
    ('989c3dc1-ac05-4d37-a917-e7948b13a99d'::uuid, 'Group 7 - Purple Peacocks'),  -- TOMATAO, CHEERY QUIARORO
    ('bae9796a-ef75-4f6e-bb4b-5cfae6d42b3c'::uuid, 'Group 5 - Blue Sharks'),  -- USARAGA, GLENN MARAVILLES
    ('28baf859-abda-4b9a-a7b5-d827178c5534'::uuid, 'Group 6 - Red Foxes'),  -- VILLANUEVA, VILMA CASANES
    ('bbe97051-7f59-401f-a651-4c04a77df520'::uuid, 'Group 6 - Red Foxes'),  -- ADTOON, ALEXANDER PINGKIAN
    ('e96c2df3-bbe0-41b6-8fd2-dfcdd492c581'::uuid, 'Group 8 - Orange Tigers'),  -- ALFORQUE, HENRY BAJARIAS
    ('263bd209-8b71-408e-8b04-f3df22ff4e0b'::uuid, 'Group 6 - Red Foxes'),  -- ARAYA, DOMINIC LAMANILAO
    ('be4676ba-4635-4ffd-8e3c-3acf05451dd9'::uuid, 'Group 3 - Yellow Vipers'),  -- ARCANGEL, WILMER BORNALES
    ('fe6ef90f-d1c9-4d46-a244-0b3c39844e13'::uuid, 'Group 2 - Pink Flamingos'),  -- ATIENZA, LYDIA DE LEON
    ('aa94f9e6-93c0-4542-830c-48148c34df4f'::uuid, 'Group 6 - Red Foxes'),  -- BACABIS, VICTOR MANGAYA-AY
    ('740734f2-1827-45bf-8cb8-5c7ecd190af8'::uuid, 'Group 7 - Purple Peacocks'),  -- BALATERO, WARREN CAYANONG
    ('98fb543a-7996-46ad-8ac8-b99721ef6027'::uuid, 'Group 4 - Gray Wolves'),  -- BALOMAGA, CHARIFE QUIBOY
    ('5574e487-a8e8-4365-bef1-ce612282ca98'::uuid, 'Group 4 - Gray Wolves'),  -- BARCENILLA, TRESITO CAROLASAN
    ('fcc3903b-7fe4-4506-9574-8af809195829'::uuid, 'Group 7 - Purple Peacocks'),  -- BARIQUIT, EDGARDO NAVALES
    ('a5a6d2c9-ffbf-45cf-9c1e-5c8c3838eb8a'::uuid, 'Group 6 - Red Foxes'),  -- BARROGA, ESTRILLO BUCOL
    ('b01e399e-5da6-4a27-8743-d581d098462c'::uuid, 'Group 3 - Yellow Vipers'),  -- BEGONTES, IAN VAN SUMONDONG
    ('f8c49f76-1c5b-4427-9029-0c2bfb91d2c8'::uuid, 'Group 1 - White Rhinos'),  -- BELDA, JAIME AGALOT
    ('98e8a0d9-40e7-4b89-9d8e-819460efa57e'::uuid, 'Group 3 - Yellow Vipers'),  -- CABAITAN, LYDIA MAINIT
    ('3c9cc0e5-8283-4302-8e52-3283756a3df5'::uuid, 'Group 7 - Purple Peacocks'),  -- CABALIT, MARIA LUCY RADA
    ('e58e0d4d-4e16-48c3-9c21-06ccf61243f9'::uuid, 'Group 4 - Gray Wolves'),  -- COBANBAN, LOWELL GUIRIGAY
    ('d053f6d2-af54-4173-9603-4c303fe03e3e'::uuid, 'Group 5 - Blue Sharks'),  -- COBRADO, PATERNO MABIA
    ('602db7cf-8ca3-41b9-8f7d-dacd3fd78a67'::uuid, 'Group 8 - Orange Tigers'),  -- DAYON, JUNJE ARNOCO
    ('17dc3a95-bca1-4316-8ede-3ca00be26809'::uuid, 'Group 8 - Orange Tigers'),  -- DEMECILLO, GINA MALIPER
    ('6e6ba9fc-a03b-4e77-a353-916b5b2d4dc4'::uuid, 'Group 7 - Purple Peacocks'),  -- ENOMAR, JAY RENATO VI&#209;AS
    ('2e543fd8-57ed-407b-8f23-cb9c38051875'::uuid, 'Group 3 - Yellow Vipers'),  -- GALINDO, GIGITH GESTUPA
    ('474828e4-7b78-4165-894b-47567c03dfa1'::uuid, 'Group 1 - White Rhinos'),  -- NAVALES, ARNILLO YONGCO
    ('7d5272c0-1bd1-4ab3-bfd9-8fd3b41f2065'::uuid, 'Group 8 - Orange Tigers'),  -- SABUERO, JOHN MARK PRAGAMAC
    ('74ace530-afb7-474a-ade1-d85f72a4142c'::uuid, 'Group 2 - Pink Flamingos'),  -- SABUERO, NOEL BERMUDES
    ('eef2109b-9625-4629-a800-3710c102ffd4'::uuid, 'Group 2 - Pink Flamingos'),  -- WONG, BILLIETO MABIA
    ('65ddf02a-0d46-433f-b476-5a2e07249cc4'::uuid, 'Group 5 - Blue Sharks'),  -- ALBISO, PELEGRINA OBINA
    ('233e3047-6ffd-478e-8dba-9aad01a7b3f2'::uuid, 'Group 5 - Blue Sharks'),  -- A&#209;ABIEZA, LOURDES MANGHANO
    ('b8aee578-b475-4a5d-bed5-51641599f836'::uuid, 'Group 8 - Orange Tigers'),  -- AUMAN, KENNITH VISITACION
    ('1afa1b10-e465-4d64-ad8b-457db80d9ac0'::uuid, 'Group 4 - Gray Wolves'),  -- ABELLA, MARIE CRIS OLORES
    ('570ebc5f-eae9-4a83-b37e-1a249caa8045'::uuid, 'Group 2 - Pink Flamingos'),  -- ACASIO, ALFIE DABALOS
    ('9abebd6f-5d37-4126-815c-56c821dc1925'::uuid, 'Group 1 - White Rhinos'),  -- ALFANTA, REY WACAN
    ('5fff1eeb-1872-4efd-82d6-e090482a6114'::uuid, 'Group 8 - Orange Tigers'),  -- BADILLA, CHARY BINAORO
    ('314e44af-5cec-4e59-83be-40b950ffd698'::uuid, 'Group 7 - Purple Peacocks'),  -- BEDASUA, JESSA MAE POPERA
    ('e5f7bdf3-dd14-46e4-9094-8cb2240e4ad3'::uuid, 'Group 4 - Gray Wolves'),  -- SEBLOS, ABIGAIL CULANAG
    ('891b22ba-bf55-4bc3-9f70-f9df69a8b882'::uuid, 'Group 6 - Red Foxes'),  -- CANUMAY, JUVY LUNGAY
    ('34ad7804-fe69-4e3e-9e68-ff51104bdcd7'::uuid, 'Group 2 - Pink Flamingos'),  -- CANCIO, NICASIO CABANDO
    ('fc717ccd-08f5-402a-88c4-177c59d1618e'::uuid, 'Group 1 - White Rhinos'),  -- COYOCA, CRESENCIANO VALDEZ
    ('cccf194c-e5d1-4205-9983-0659e73d894c'::uuid, 'Group 2 - Pink Flamingos'),  -- DIAGRO, JAYSON SOLIANO
    ('0276875e-a128-4855-bbb7-695f15f85080'::uuid, 'Group 7 - Purple Peacocks'),  -- HERNANE, ARNULFO ALFARO
    ('4c5ed8b8-848a-4475-83f3-6ea4d63905c0'::uuid, 'Group 6 - Red Foxes'),  -- BANTILAN, MARJOERE KRISTINE CAMINGAO
    ('49f3c82f-1ac7-46d1-b4bc-dcbeb69c4876'::uuid, 'Group 6 - Red Foxes'),  -- GUANGCO, FERDINAND MIRABUENO
    ('4c417f24-ebc4-4898-b36e-af7e37444bee'::uuid, 'Group 4 - Gray Wolves'),  -- KAAMI&#209;O, RODOLFO ROSAURO
    ('ae478a52-726f-4089-98e8-4bcdaf3a810f'::uuid, 'Group 7 - Purple Peacocks'),  -- OBUT, GLENBERT LARANJO
    ('0445b639-aacd-4044-bc77-ebab339e01bc'::uuid, 'Group 8 - Orange Tigers'),  -- PAROJINOG, MARICELA AQUINO
    ('be2509d6-599b-4113-8702-df0d4e1a5825'::uuid, 'Group 8 - Orange Tigers'),  -- TOLENTINO, JEMUEL RAYMOND REQUILME
    ('6fb3bcb3-cf37-4d03-afa5-f5394f5db72d'::uuid, 'Group 6 - Red Foxes'),  -- VALE, SHERYL MALUTO
    ('e061ea1c-1dc5-4242-95fd-69eb41e5406e'::uuid, 'Group 6 - Red Foxes'),  -- BULLECER, JOHNREY DALO
    ('eba43744-0bc5-43d9-994d-313ba69c12a2'::uuid, 'Group 7 - Purple Peacocks'),  -- FABIE, ETHEL TUMIMBANG
    ('fca48756-4a65-4eff-9519-bdc9ce98d9a2'::uuid, 'Group 4 - Gray Wolves'),  -- MALINIS, GRACE GALLO
    ('3c430d93-6ae9-4064-8893-2db029ab8267'::uuid, 'Group 6 - Red Foxes'),  -- MARPE, PEARL ANGELIE CA&#209;EDA
    ('9e730f0b-525a-47f2-ac1e-320f27ff9064'::uuid, 'Group 5 - Blue Sharks'),  -- NERI, NENABETH LAURETE
    ('bd5f800e-447b-4f97-bc40-7f81ef2dd7e3'::uuid, 'Group 1 - White Rhinos'),  -- PATALAN, JANDRADE MONTECILLO
    ('e022f602-7020-4546-bd17-53fcee6767f7'::uuid, 'Group 4 - Gray Wolves'),  -- QUI&#209;ONES, ALJUNE GONZAGA
    ('7fa507cd-4f03-4099-aa22-bb3c8572d7eb'::uuid, 'Group 1 - White Rhinos'),  -- TUMANDA, ELIBERT DOCUMENTO
    ('12bf4bf7-8d62-4e42-a65c-17ad5d1cfcab'::uuid, 'Group 5 - Blue Sharks'),  -- JUARIO, JINKY TEJANO
    ('b473172c-e6e4-4b18-83ec-b124693e7c6d'::uuid, 'Group 2 - Pink Flamingos'),  -- LAYLAY, JERRY BALDESANSO
    ('3c336ab7-557b-4cc4-aa88-ddc04fa3aee7'::uuid, 'Group 3 - Yellow Vipers'),  -- ABDUL, ANTHONY JAMES OFEMA
    ('d7f130c2-13ea-458c-8942-a934dbf42097'::uuid, 'Group 2 - Pink Flamingos'),  -- BALO, EDNA BINAORO
    ('8883b741-8acc-4a4e-acd0-e916b35bdcb2'::uuid, 'Group 2 - Pink Flamingos'),  -- SUAREZ, GRETCHEN FERNANDEZ
    ('d731ed66-1398-4cf0-9c54-46cbbe22d14e'::uuid, 'Group 4 - Gray Wolves'),  -- DALIS, HAIADIS MAILLA
    ('db1371eb-2ebc-4529-9236-6374073289f5'::uuid, 'Group 6 - Red Foxes'),  -- BETACHE, ROEL DONAL
    ('9d4daf79-8c77-41ef-aeb6-054f65c8eae0'::uuid, 'Group 1 - White Rhinos'),  -- DEMOSER, REYNANTE PAZ
    ('bd9bbd8d-5c0d-4896-836e-971531e7f63a'::uuid, 'Group 2 - Pink Flamingos'),  -- DUMANJUG, Ma. CRISTINA DELOS SANTOS
    ('70c8f747-744f-4d5f-82f8-4b6e63710400'::uuid, 'Group 5 - Blue Sharks'),  -- ENGRACIA, JOEL MOLINA
    ('415413bb-4f49-4223-8a2c-7d43a35cec13'::uuid, 'Group 8 - Orange Tigers'),  -- GORDOVE, MERLIN TAROY
    ('70c8e07e-24f8-4626-8ccd-d0e47206f6cd'::uuid, 'Group 2 - Pink Flamingos'),  -- HERNANDO, RELIGIOSA CAINGLET
    ('965d3620-2c48-4972-96e5-9e619074eeb8'::uuid, 'Group 7 - Purple Peacocks'),  -- PANCHO, MARY JEAN ALJAS
    ('b77dbfa3-c32c-4693-a268-b1f922dd09af'::uuid, 'Group 6 - Red Foxes'),  -- RAAGAS, MITZEL VILLANUEVA
    ('1b1b135d-f657-4a6b-b4cc-00cec3445f89'::uuid, 'Group 5 - Blue Sharks'),  -- TAGHOY, MARK ALVIN TENCHAVEZ
    ('a56847c8-f7ae-4e35-8dfc-977d9af4f2bc'::uuid, 'Group 6 - Red Foxes'),  -- DAYON, JUNREY ARNOCO
    ('2999f2d6-db32-4247-b2fd-7c3195d74475'::uuid, 'Group 4 - Gray Wolves'),  -- SISO, MELYNDA BOLAY-OG
    ('ec47745c-212b-44c9-8967-7a10c92c0851'::uuid, 'Group 6 - Red Foxes'),  -- YLANAN, CHRISSA FAITH SEVILLA
    ('5104cb08-8ea9-41b9-a832-352c92e06e6c'::uuid, 'Group 8 - Orange Tigers'),  -- AGUSTIN, EMIL VINCENT PAUL BACLAYON
    ('613e404d-a15a-4e17-bf65-13ed38b6722e'::uuid, 'Group 3 - Yellow Vipers'),  -- ADARLO, JOSEPHINE CABUS
    ('9242d99a-b0be-458a-8a22-c694b2785f38'::uuid, 'Group 2 - Pink Flamingos'),  -- VALLAR, MARIE CRIS OZAMIZ
    ('37b0d70c-700f-4d7e-8c26-982026d2e81a'::uuid, 'Group 1 - White Rhinos'),  -- PUTIS, MARIA LOURDES DELA TORRE
    ('c0cd5479-68f3-4c41-891d-466261b6ff5a'::uuid, 'Group 6 - Red Foxes'),  -- ANDRADA, DAVE RODRIGUEZ
    ('74be003d-885b-45c6-b51d-6294e77204d9'::uuid, 'Group 4 - Gray Wolves'),  -- BANAYBANAY, MAY UDARVE
    ('a84ca6bd-8b45-44fd-87fb-09d7fcfec97e'::uuid, 'Group 6 - Red Foxes'),  -- DULA, IMELDA PEQUIT
    ('f74e174f-6e45-422d-aba9-46b27772aa99'::uuid, 'Group 5 - Blue Sharks'),  -- EGOT, EVENIZER DELOS SANTOS
    ('00a25770-f37f-48e8-b224-a2cde10a5e6c'::uuid, 'Group 3 - Yellow Vipers'),  -- ENGRACIA, DENNIS VEVENCIO SAYSON
    ('f68b6037-eb12-48ea-a8fd-6cc480e9936b'::uuid, 'Group 3 - Yellow Vipers'),  -- ENGRACIA, ROY ABELO
    ('5d619ec4-2d13-4476-a7c5-62e83bb3cde5'::uuid, 'Group 6 - Red Foxes'),  -- MUGAR, ROSEMARIE MACARAYA
    ('a617eaa0-d03a-4da4-bec1-ff5a7c664a4f'::uuid, 'Group 1 - White Rhinos'),  -- PAROJINOG, VIVIAN CELLAN
    ('bfdf5b3b-0d33-41b5-b828-475d833d8487'::uuid, 'Group 3 - Yellow Vipers'),  -- PUNZALAN, DONALD VONNE MEJIAS
    ('b7695499-c477-4868-b1fd-8787d7528e2f'::uuid, 'Group 4 - Gray Wolves'),  -- RONQUILLO, JAYMILYN MARBELLA
    ('a8a3f4c2-0fef-4a3a-b7a4-b76f91a7f9ef'::uuid, 'Group 6 - Red Foxes'),  -- SUEZO, DARIUS CHIU
    ('6f43c67b-ca99-49e9-8521-957f7998adf6'::uuid, 'Group 4 - Gray Wolves'),  -- PRIETO, EMMA ANGHAG
    ('4140ac48-b2e1-41f2-8f9e-4bdbf2a4a8c2'::uuid, 'Group 2 - Pink Flamingos'),  -- PARAME, DICEL GRACE ORCULLO
    ('c4b0f5cb-24b4-4b7f-8b07-9811b9e9897a'::uuid, 'Group 6 - Red Foxes'),  -- AGUSTIN, EDSON SONOGAN
    ('0ededdb8-d898-40ba-9f8d-23448d1b8f98'::uuid, 'Group 6 - Red Foxes'),  -- VILLAVELEZ, ANA CARMELA OBOD
    ('78d9f681-253b-457b-9507-81a05139dbfa'::uuid, 'Group 2 - Pink Flamingos'),  -- DALOYOC, DOMINADOR CABALAN
    ('d3dae0e4-9a42-48fd-989d-5dc06ea88c8a'::uuid, 'Group 3 - Yellow Vipers'),  -- DESIERTO, NANCY SUELO
    ('cab8ab2d-c740-4b12-b74d-e566d1145dfe'::uuid, 'Group 6 - Red Foxes'),  -- ECHAVEZ, LEOWIL DAGANDAN
    ('e39e05b9-4240-4b6f-82e0-789726bb6065'::uuid, 'Group 1 - White Rhinos'),  -- MALALIS, JUDELIZA GUIPO
    ('46023080-8e8c-4924-9260-96357567d748'::uuid, 'Group 3 - Yellow Vipers'),  -- ADIONG, HAYDEE ROXAS
    ('9b23fcb1-55f6-44a6-8f30-7b02f82a5c7c'::uuid, 'Group 3 - Yellow Vipers'),  -- BEHIS, ROSENDA MAATA
    ('3beffe96-b88f-4421-a706-3d4a7ba314a9'::uuid, 'Group 5 - Blue Sharks'),  -- PREJOLES, GANDER LAMPARAS
    ('026da9ce-833b-4c63-a3d1-061bbe9cd433'::uuid, 'Group 6 - Red Foxes'),  -- PUNZALAN, MELANE LYN CARLOS
    ('a3d93d75-0e65-4f3a-b7cb-bdc7259be2ce'::uuid, 'Group 2 - Pink Flamingos'),  -- PERALTA, MARY JANE QUIAO
    ('3b87d15a-8acc-4406-b7f0-4da92b6d32af'::uuid, 'Group 8 - Orange Tigers'),  -- BATOON, LUIDA LUMONTOD
    ('56b50d40-04df-49a2-a24e-fa38716e29ca'::uuid, 'Group 2 - Pink Flamingos'),  -- DEMECILLO, JOJIE FRANCISCO
    ('da0c09af-7771-4977-927e-6d25e15ca332'::uuid, 'Group 6 - Red Foxes'),  -- GO, BRIXLYJUN LIM
    ('4409e58b-20d7-43bb-8fea-d9cc6fa3c934'::uuid, 'Group 1 - White Rhinos'),  -- JAGONIA, LILY DEMECILLO
    ('63c2a573-bdf5-42b5-9edc-e6f5c5149db0'::uuid, 'Group 8 - Orange Tigers'),  -- LAGO, RAYBERN VERGAS
    ('335508fc-a88b-430c-982a-5af05a50aef6'::uuid, 'Group 5 - Blue Sharks'),  -- MAGHANOY, DAISY DIZON
    ('798f5a2f-4527-4bf6-b597-671374e1181a'::uuid, 'Group 3 - Yellow Vipers'),  -- MURALLON, MARY JANE RUBIO
    ('4f4533cf-1150-4812-9606-738f2da0054e'::uuid, 'Group 5 - Blue Sharks'),  -- NORONIO, ADELINA DALID
    ('4d4ae7a2-6f01-49f4-a6fd-22081a9629ae'::uuid, 'Group 3 - Yellow Vipers'),  -- AUTOR, CHERRY ANN PEPINO
    ('cf5760eb-e831-453e-9643-a15a4a91d10a'::uuid, 'Group 7 - Purple Peacocks'),  -- GUANGCO, DARLENE MASONG
    ('fdc67679-731b-4259-96b0-7733d8c2d8f7'::uuid, 'Group 4 - Gray Wolves'),  -- CALVO, ROLOVEL MALBUYO
    ('5c8c9014-f8b6-41d4-a179-7256fcb1d690'::uuid, 'Group 1 - White Rhinos'),  -- DASIGAN, CHERRY MAY BUSTAMANTE
    ('2af3eeb5-aa48-4d00-ab37-5ba4e6ab59be'::uuid, 'Group 7 - Purple Peacocks'),  -- PANG-AN, NAOMI GARBAN
    ('9ffd38e1-6551-4f6b-b71a-7c35e833cd97'::uuid, 'Group 7 - Purple Peacocks'),  -- BONDACO, SUSAN CARUMBA
    ('9023c5f4-0313-4b7e-a899-31d79ad4da47'::uuid, 'Group 2 - Pink Flamingos'),  -- BRAZA, DIONNIS HOPE RAMAYRAT
    ('17f7b196-f8ac-484e-a8a6-6ce9f8435aa4'::uuid, 'Group 8 - Orange Tigers'),  -- CAAY, CHARLES GALLEPOSO
    ('ab4dfa3b-2d88-4667-b07e-212e32f3649d'::uuid, 'Group 3 - Yellow Vipers'),  -- CAAY, MELCHOR GALLEPOSO
    ('6ad96289-86a8-4452-ba30-35ed485161fd'::uuid, 'Group 8 - Orange Tigers'),  -- CALOPEZ, ERNALYN BICOY
    ('b8e056b8-65ee-4c0e-a39a-6a713d9980ed'::uuid, 'Group 7 - Purple Peacocks'),  -- EMPIALES, ARMILA CARCUEVA
    ('a65287fc-89d2-4e11-8563-126c6a26b1f9'::uuid, 'Group 1 - White Rhinos'),  -- FUENTES, MARILYN AMPARADO
    ('961f24bc-70ed-4645-9d95-b300c4de4ebf'::uuid, 'Group 3 - Yellow Vipers'),  -- HERNANE, ESTELA COCA
    ('9babfdae-96f9-4350-91f9-800ab49dec20'::uuid, 'Group 3 - Yellow Vipers'),  -- JARITO, ESMELENZI CALUNSAG
    ('6ac810a3-07ac-47d7-9191-4a6b1d0a5a6d'::uuid, 'Group 8 - Orange Tigers'),  -- MANTUA, TERECEL BASCO
    ('22e16f38-775a-4e4b-a003-cb1bea677355'::uuid, 'Group 6 - Red Foxes'),  -- ODVINA, EVA OCAMPOS
    ('eb811cdd-955f-40a8-81ef-d9d074cdd95b'::uuid, 'Group 7 - Purple Peacocks'),  -- REGIDOR, GEMMA ODBINA
    ('b1a1cb7a-0459-413f-a677-3e59913593c7'::uuid, 'Group 4 - Gray Wolves'),  -- VALEROSO, CORAZON MIRONTOS
    ('2052b1fb-b6c2-405e-9d0d-2b0ba196f242'::uuid, 'Group 8 - Orange Tigers'),  -- VILLANUEVA, GENALYN DIANGCO
    ('32e07b22-cbf6-4f52-9522-0e78c51417eb'::uuid, 'Group 3 - Yellow Vipers'),  -- ADLAWON, MARIFE GABAS
    ('fe720b96-8435-4673-a500-66ec1f689de7'::uuid, 'Group 8 - Orange Tigers'),  -- OSORIO, DAPHNE BRASILE&#209;O
    ('070e6d6f-9e2b-4728-a013-5ee7a3de40aa'::uuid, 'Group 3 - Yellow Vipers'),  -- LAGO, BENEDEN FUENTES
    ('db9afdfa-f2ef-454a-80f9-b4bfa99105b6'::uuid, 'Group 7 - Purple Peacocks'),  -- MAISLING, IVY MARIE DINOPOL
    ('a121fc8f-1219-4faf-8844-daecac0d91c3'::uuid, 'Group 8 - Orange Tigers'),  -- PARAMI, PATROCENIO CASINTO
    ('b320feaa-2c19-4fbf-8206-5b4bbb6cc2a9'::uuid, 'Group 3 - Yellow Vipers'),  -- PONDAY, MARY JANE JALEM
    ('09a09d65-1d99-4b3e-928b-cc3d282208a9'::uuid, 'Group 8 - Orange Tigers'),  -- QUIAO, KATHRINE JUNE ROSKA
    ('5f680867-b2f2-4cbd-a4e4-aebbf1143075'::uuid, 'Group 5 - Blue Sharks'),  -- SALVADOR, EDNALYN ARAO
    ('7f448867-9337-4bba-be8e-e53e2c65b663'::uuid, 'Group 1 - White Rhinos'),  -- SIROT, ALMA GODOY
    ('7edd721b-c6ef-416d-965d-6c2d036808cd'::uuid, 'Group 8 - Orange Tigers'),  -- TAGAL, LHEVI MAE CABRERA
    ('9ae25dac-af4c-40dd-b07c-614122d9ef3c'::uuid, 'Group 1 - White Rhinos'),  -- VILLA, ALFIE DAWIS
    ('b5bd1d8f-95b1-4f25-b038-85d1e25663f4'::uuid, 'Group 5 - Blue Sharks'),  -- ZAMORA, NORA LARGO
    ('8df3aa29-37d9-4c5d-aab1-a6c25e075725'::uuid, 'Group 2 - Pink Flamingos'),  -- CALAMBA, CONCEPCION ADTOON
    ('858b92df-1692-4d95-a495-f8607b8532ba'::uuid, 'Group 1 - White Rhinos'),  -- CORTES, DAN MICHOLLE LADERA
    ('bcbace0f-29a3-414c-9d8e-5360ccac37a5'::uuid, 'Group 2 - Pink Flamingos'),  -- DAYON, LORELIE ARNOCO
    ('47a48dad-f10c-4252-a20f-a6e1ca06c255'::uuid, 'Group 2 - Pink Flamingos'),  -- DELA VI&#209;A, DELILAH GONZAGA
    ('0f0e1c63-9dd4-4e3c-b143-4bf6ad2a2b68'::uuid, 'Group 2 - Pink Flamingos'),  -- GOMOS, GEMMA OLMEDO
    ('4e04564b-3fcc-45b0-81eb-4fc2cf7abc64'::uuid, 'Group 3 - Yellow Vipers'),  -- MATCHUCA, PEARLLYNN NERI
    ('7359ad41-e8f8-41fa-8dea-7759f15656e6'::uuid, 'Group 7 - Purple Peacocks'),  -- MEJARES, MARIA LISETTE CABRERA
    ('7a938d74-f332-40ef-abe3-b52899a2cddb'::uuid, 'Group 8 - Orange Tigers'),  -- SARZUELO, LORFIE LAPASARAN
    ('89d679e5-203b-4061-b49b-1f843e024c1f'::uuid, 'Group 4 - Gray Wolves'),  -- VIRTUDES, WILSON MENAJE
    ('20f5a20f-60aa-4555-83a8-80d620d2c651'::uuid, 'Group 8 - Orange Tigers'),  -- TAPAYAN, RAMEL DENILA
    ('480cbcd7-df00-4f24-8b12-0bae38a8c826'::uuid, 'Group 4 - Gray Wolves'),  -- VILLANUEVA, EMILY GIN BATERNA
    ('5d0f2a06-a5c8-4c8c-98d9-60758ffba006'::uuid, 'Group 8 - Orange Tigers'),  -- BATERNA, SARAH JEAN FERNANDEZ
    ('7103eeb4-38ee-43ca-bc92-635faf5804e6'::uuid, 'Group 5 - Blue Sharks'),  -- BULAO, CLYDE SAQUIN
    ('a64ebfc3-b424-4d59-8690-59e9b2807a1f'::uuid, 'Group 8 - Orange Tigers'),  -- CABILUNA, PROLYN CA&#209;ETE
    ('288b4e15-8ea9-4ab4-8933-ca64f1762d47'::uuid, 'Group 5 - Blue Sharks'),  -- CALIGUID, JHONAMAE
    ('c74aafef-278c-493c-9487-82cf41612df1'::uuid, 'Group 1 - White Rhinos'),  -- CALLENERO, ELLEN PAQUERA
    ('82ea007b-3a2e-47e6-8db7-b4b4d11a62da'::uuid, 'Group 8 - Orange Tigers'),  -- CA&#209;AMO, JOEL ENCARNACION
    ('5aba8133-fbc4-492c-b6ce-9a7e611855e6'::uuid, 'Group 5 - Blue Sharks'),  -- CANDONGO, ROSALEE DACOYCOY
    ('47b98d5f-f0aa-44f7-98ab-71fd2c750589'::uuid, 'Group 2 - Pink Flamingos'),  -- CASTILLON, NAPOLEON PEGALAN
    ('082462c3-3693-4299-8284-3261a7e88a35'::uuid, 'Group 7 - Purple Peacocks'),  -- CASTRO, AIYA MARIE ORONG
    ('307fd1d1-a507-4b1a-b6ef-0eec3e0b4caf'::uuid, 'Group 5 - Blue Sharks'),  -- CATAPANG, AMALIA LOPEZ
    ('39edc303-adb6-4131-8149-c3c4fccebbff'::uuid, 'Group 3 - Yellow Vipers'),  -- CATAPANG, JOSEPHINE PALANG
    ('bea2e356-8c71-4c94-913a-42ae232d3345'::uuid, 'Group 2 - Pink Flamingos'),  -- DAGALA, ANNE FATIMAH GANDAROSA
    ('2cdf7d5d-6661-4a27-93f5-4abdbd38e07d'::uuid, 'Group 7 - Purple Peacocks'),  -- DELOS REYES, DANICA APRIL EVIDENTE
    ('501cdcea-711c-4cc9-a45e-cb4dbc4bc26a'::uuid, 'Group 1 - White Rhinos'),  -- DULLER, KAYCEE LUMACAD
    ('3ab5ba4d-f402-4d1d-86ea-21ec21f15c46'::uuid, 'Group 1 - White Rhinos'),  -- HANDUGAN, MARK LESTER PAPAYA
    ('3a0f7831-0e83-4375-a80a-0aeb79abebdb'::uuid, 'Group 7 - Purple Peacocks'),  -- LABAD, MIERA FUENTEVILLA
    ('dd6c1857-462c-424d-b702-438f57305341'::uuid, 'Group 5 - Blue Sharks'),  -- MAGSAYO, REY BORONGAN
    ('66e4785f-adfa-4a87-9666-ca5c2a7c0eb7'::uuid, 'Group 7 - Purple Peacocks'),  -- OLIVEROS, REENA LLEMIT
    ('1cfddaab-6562-4850-81e0-c4a843cfda31'::uuid, 'Group 4 - Gray Wolves'),  -- PALANG, MA. GLYNDA ALGOSO
    ('9ac166de-e424-4417-87f7-3023c7239457'::uuid, 'Group 7 - Purple Peacocks'),  -- PORMENTO, MARIA PAZ ALAVE
    ('73d3724d-ee92-4cbc-bc90-3a35d30a21f8'::uuid, 'Group 2 - Pink Flamingos'),  -- PUSOD, GINA FRANCE MONTEBON
    ('9327693b-b897-46ee-bba1-433038c230e0'::uuid, 'Group 4 - Gray Wolves'),  -- RUSSEL, MARCELA BALORIA
    ('63241563-f81d-4569-b047-6a1817e8dc9b'::uuid, 'Group 6 - Red Foxes'),  -- SAQUIN, FARLEY BRETT LOPEZ
    ('5ce07c3e-68a8-409f-bcf7-db8682eb77ca'::uuid, 'Group 1 - White Rhinos'),  -- SECRETO, MARY ANN THERESE KAAMI&#209;O
    ('e79f59b4-6229-479b-a88d-889ce6021532'::uuid, 'Group 7 - Purple Peacocks'),  -- TUMANDA, KARLIZLE AUBREE CANDONGO
    ('23ef277e-ea51-4d9f-a137-7090f3133cd1'::uuid, 'Group 2 - Pink Flamingos'),  -- ADLAWON, ROWYNNE JAN MARIE GABAS
    ('3ab096f5-c2b1-466d-910b-40ef1c72e3fe'::uuid, 'Group 4 - Gray Wolves'),  -- POLOYAPOY, CRESHA MAE AGPASA
    ('11074ed6-b7a6-4a93-a55c-407a3ddc92e4'::uuid, 'Group 1 - White Rhinos'),  -- DENLAOSO, MARILOU NABUA
    ('89129f55-f3d6-45b4-9798-0f4c9583d2df'::uuid, 'Group 6 - Red Foxes'),  -- FUENTES, MICHAEL ESTRADA
    ('979dcbb1-a86b-4da6-baa4-3263ffb6b872'::uuid, 'Group 4 - Gray Wolves'),  -- DECENA, REY MAATA
    ('5e8b64cb-ea09-4d54-9546-c4b1b4064238'::uuid, 'Group 8 - Orange Tigers'),  -- TAPITAN, JONABEL RABANES
    ('0ba052d9-a49d-43ee-b04e-046937de2301'::uuid, 'Group 4 - Gray Wolves'),  -- ALFORQUE, MARILOU JUMAO-AS
    ('94b63910-3b1f-4e3e-b1f6-dc380979f1ea'::uuid, 'Group 6 - Red Foxes'),  -- BALANSAG, CHERYVET PONTINES
    ('596564d9-0b64-4012-8838-40fdcda9bdcd'::uuid, 'Group 1 - White Rhinos'),  -- BULANTE, AMORMIA OBOR
    ('669f0f0b-37c5-44f1-a839-6af1c61cd455'::uuid, 'Group 4 - Gray Wolves'),  -- CABANDO, JULIET CORONEL
    ('2f737521-a16e-458f-be5f-f06f7232fe2a'::uuid, 'Group 1 - White Rhinos'),  -- CABRERA, HEIDE BAYAWA
    ('0dd38765-c7ff-4948-9f98-62f724c2f94c'::uuid, 'Group 2 - Pink Flamingos'),  -- CAMPO, ANN MYRA SANORIA
    ('07222a1d-8cd6-4d36-a83d-6e06a67c468c'::uuid, 'Group 3 - Yellow Vipers'),  -- MOSQUEDA, MYLENE BACOLOD
    ('1cb7ce90-7290-43c9-9940-02c3872e2e7d'::uuid, 'Group 4 - Gray Wolves'),  -- CUI, PATRICK GAMIL
    ('649fdb52-8cd0-4802-9561-a905218716ec'::uuid, 'Group 6 - Red Foxes'),  -- DORONA, MARLON FERNANDEZ
    ('142a983d-ac68-4b96-90cd-5cb0d4f0ada5'::uuid, 'Group 6 - Red Foxes'),  -- DYBONGCO, CHARMAINE CAPARAZ
    ('7e2f8681-fa22-4de5-94bb-37bd2eee7ea6'::uuid, 'Group 2 - Pink Flamingos'),  -- EGUIA, RICFER FUENTES
    ('eabb057d-1df6-4786-bd53-b8aa84bb03af'::uuid, 'Group 7 - Purple Peacocks'),  -- GABAS, MARIBEL TABOTABO
    ('3f879be2-c428-4668-b390-92213370f2eb'::uuid, 'Group 6 - Red Foxes'),  -- GONGOB, MARY JOY MACAPAZ
    ('9d9f80d4-33e9-4469-af60-57aeb22234cb'::uuid, 'Group 3 - Yellow Vipers'),  -- HANDUGAN, CHIELO PAPAYA
    ('41676cd7-f5d8-42cd-b932-80c2b8c44598'::uuid, 'Group 8 - Orange Tigers'),  -- JALEM, WILHELM DEL SOCORRO
    ('35ff89ef-b334-4c18-b862-666ffed57ca2'::uuid, 'Group 4 - Gray Wolves'),  -- JAMONER, MELANIE SAGARIO
    ('b5519d65-9c6c-44d7-aed9-34b0a21d641a'::uuid, 'Group 4 - Gray Wolves'),  -- JUMAWAN, FLORANGELE BEDASUA
    ('ce6fa40d-c1db-490a-8e75-9e1590383d48'::uuid, 'Group 5 - Blue Sharks'),  -- KAAMI&#209;O, LOUIS COLCOL
    ('aaf53467-9b66-4e42-b2b0-c1b313e7c326'::uuid, 'Group 7 - Purple Peacocks'),  -- LAURENCIO, MARICHU BAGISPAS
    ('0d748dc4-4d2e-42a5-a9d8-ae4261874241'::uuid, 'Group 8 - Orange Tigers'),  -- LUMACAD, ISABELITA LUAB
    ('cbb91c72-a610-4b80-9919-1c9a38e23b6a'::uuid, 'Group 3 - Yellow Vipers'),  -- MINQUE, LISZEL BINAL
    ('53fb0814-abc3-41e5-87fb-58045f3f95c2'::uuid, 'Group 2 - Pink Flamingos'),  -- MODEQUILLO, MARIA JEWEL CA&#209;IZARES
    ('b9b068c0-046e-4b65-8012-0337c1663543'::uuid, 'Group 5 - Blue Sharks'),  -- MONTON, ROSITA MAGHINAY
    ('b6f14270-f0f0-44c0-bfe0-f142c0474a27'::uuid, 'Group 6 - Red Foxes'),  -- MORECHO, MARISSA JANE KONG
    ('5cb3c68c-7a6c-4266-889d-5b97d917470d'::uuid, 'Group 7 - Purple Peacocks'),  -- OGA, IAN RHEY RECONALLA
    ('b8aa683c-536d-4b4a-9bb4-a98000109d00'::uuid, 'Group 3 - Yellow Vipers'),  -- ORTIZ, MARIA OPAMIN
    ('8ca45ffb-67ea-44d3-a493-2324c329d475'::uuid, 'Group 6 - Red Foxes'),  -- PAYLAGA, CHONA BUHISAN
    ('4f39b2de-a27b-4453-9048-b228cd9e9189'::uuid, 'Group 2 - Pink Flamingos'),  -- PENDO, CANDELARIA SILVA
    ('48cbb345-4631-4406-bc51-29d6e0676f31'::uuid, 'Group 7 - Purple Peacocks'),  -- ROSALES, CHERYL RADA
    ('7a06cc20-b25f-4c5d-bcb6-aaf15d5e4306'::uuid, 'Group 5 - Blue Sharks'),  -- SALON, CHERILYN SONER
    ('b535cd02-3d15-4721-9716-6079f1b815ac'::uuid, 'Group 6 - Red Foxes'),  -- TURNO, CIRILO PUNTUAL
    ('d7aa4fbe-572c-49f8-a8a4-ba8997e9dd5e'::uuid, 'Group 7 - Purple Peacocks'),  -- PALMA, DECIRYL MANAROG
    ('42f5f7ab-a41f-474d-8a69-1c22605159e9'::uuid, 'Group 3 - Yellow Vipers'),  -- DAYOC, IRISFEL BLANCHE FABRIA
    ('6ff63dc2-b33e-49fc-b88d-59983c106616'::uuid, 'Group 6 - Red Foxes'),  -- PACA&#209;A, MARY ANN PACTO
    ('8180b306-c8e1-435d-9eac-63a6e125344f'::uuid, 'Group 6 - Red Foxes'),  -- RAMAYRAT, VANISSA ALBINA
    ('a774f5d0-48b4-4f9d-86ff-af2d07f0b3a4'::uuid, 'Group 4 - Gray Wolves'),  -- RAS, DELIA SOSME&#209;A
    ('4969a233-5c5c-4489-9943-f64c2082cc38'::uuid, 'Group 7 - Purple Peacocks'),  -- SAGARIO, ANECITO RODRIGUEZ
    ('ebf22a66-3963-40b6-9770-f29dba9e1fdb'::uuid, 'Group 7 - Purple Peacocks'),  -- SANTOS, RAJESBRICK PAGLINAWAN
    ('ec054beb-04c4-46b3-8724-842af1ec8e12'::uuid, 'Group 2 - Pink Flamingos'),  -- SEDEO, REVY CATHLEEN ORTEGA
    ('b7f35594-7755-4b79-991f-ec55dcc24e27'::uuid, 'Group 8 - Orange Tigers'),  -- TENCHAVEZ II, AUDIE ENGRACIA
    ('656a0502-4a01-4bd0-ae0d-84fa0cc92000'::uuid, 'Group 5 - Blue Sharks'),  -- CORONEL, SERAFIN RUBIO
    ('34657f43-03ad-4f3b-a079-19cc846d8eeb'::uuid, 'Group 7 - Purple Peacocks'),  -- ZAFRA, JOSE EUGENIO POLICARPIO
    ('5a74a7cf-f9b2-4c42-8b13-d60c29d28e92'::uuid, 'Group 8 - Orange Tigers'),  -- MAGLANGIT, LADY JANE ELMEDULAN
    ('2a9242d3-9ec7-49a6-a618-43598521260e'::uuid, 'Group 1 - White Rhinos'),  -- LIMBARING, ANA MARIA AMORES
    ('ebb60973-0ef1-4df0-a268-ba277147b4e3'::uuid, 'Group 4 - Gray Wolves'),  -- SATORRE, JANICE CA&#209;ETE
    ('281676a6-b922-43c1-a739-bd42c74d2ca1'::uuid, 'Group 4 - Gray Wolves'),  -- CAHOY, MAURICIA BANGUIS
    ('9d0d1eb9-682a-4443-9aee-d0b0393789d2'::uuid, 'Group 1 - White Rhinos'),  -- CANSECO, JULIE PEACH OGA
    ('4d18880f-2644-4a2d-afb1-fdee64f4f7e8'::uuid, 'Group 3 - Yellow Vipers'),  -- MI&#209;ON, ROMY ANTONIO LABADISOS
    ('3d234e22-31e6-416a-87e4-c9390d6b1eec'::uuid, 'Group 5 - Blue Sharks'),  -- SALISID, RONALD SALOMON
    ('6dec3169-e014-42f4-ace5-29b61d512a8e'::uuid, 'Group 2 - Pink Flamingos'),  -- BACANG, VILMA GRAMPON
    ('3ce1006c-2c5c-4393-88e8-86f11609aae0'::uuid, 'Group 5 - Blue Sharks'),  -- RATO, FALMERA RODA
    ('6bc2e017-2c8a-438d-8dc3-cf54d4f6ebfb'::uuid, 'Group 5 - Blue Sharks'),  -- CAMILO, EMILY TUBA
    ('7bf6df84-c0d6-4a1e-8cf1-34b1d99876c0'::uuid, 'Group 4 - Gray Wolves'),  -- SEVILLA, SHELLA MAE NORCA
    ('e0bd1bcb-7030-45b5-ada0-0458061ecd94'::uuid, 'Group 1 - White Rhinos'),  -- ABA, MENARDO RAYO
    ('bfcb2073-bacb-4ab5-8045-651403073b67'::uuid, 'Group 7 - Purple Peacocks'),  -- ABENIDO, APPLE JANE MALIGDONG
    ('1ee0a5f5-e197-41fa-b78f-b8b640610dc3'::uuid, 'Group 6 - Red Foxes'),  -- ALDUHEZA, MILDRED BELOY
    ('b425d78a-23f0-401c-9b02-b8efde3eea60'::uuid, 'Group 5 - Blue Sharks'),  -- ANTIPUESTO, VIOLA DALAGAN
    ('3dc6c9d1-b5e6-4e4c-91f4-ec3b92a34f66'::uuid, 'Group 3 - Yellow Vipers'),  -- CABILLAS, MARICEL VILLAME
    ('13d0819f-5439-4ba8-87c0-c2d867445255'::uuid, 'Group 6 - Red Foxes'),  -- CALMA, NENA BACOR
    ('723a43f7-cc97-495a-bbac-97048379d2cb'::uuid, 'Group 5 - Blue Sharks'),  -- CAMACHO, EMILY JABINES
    ('c904fe16-893b-40ba-a6a4-2a908890ef49'::uuid, 'Group 8 - Orange Tigers'),  -- CARTAJENAS, ELLA FE APOG
    ('613331f6-b82b-4329-b524-08da72fb6da6'::uuid, 'Group 6 - Red Foxes'),  -- CELADA, BENJIE TOMADA
    ('6f228299-6b11-4920-a6e2-eddfe830ebb1'::uuid, 'Group 7 - Purple Peacocks'),  -- DIZON, JEANNY MAE GALLEGO
    ('3b197d90-f5e3-43d3-a18c-48ee3d237dff'::uuid, 'Group 4 - Gray Wolves'),  -- GOMEZ, DESIREE AMOR GABULE
    ('d0911e40-6a7b-4352-a112-dcb5c3178f6e'::uuid, 'Group 6 - Red Foxes'),  -- INSOGO, PENNY LOU DENORE
    ('3ea800f8-69f1-4c88-839e-6f8484266d9f'::uuid, 'Group 7 - Purple Peacocks'),  -- LONGAYAN, VANESSA MONSALE
    ('e42e928b-77af-4556-97ac-8cd75bdc9a04'::uuid, 'Group 4 - Gray Wolves'),  -- DE LEON, JERALYN PARAN
    ('0793c4fe-6a13-4d56-9b62-84cf344d7c75'::uuid, 'Group 8 - Orange Tigers'),  -- BALCITA, REDANTE OCAMPO
    ('343d0a9c-3a3d-44e2-94ed-96f1bb5148da'::uuid, 'Group 5 - Blue Sharks'),  -- CRAUSUS, DINDO VALDEZ
    ('a6b160ef-53c6-49d9-8ca1-cd925162a2f1'::uuid, 'Group 3 - Yellow Vipers'),  -- DELICA, MERCEDITA ONGCO
    ('92a565d9-335b-4e2c-98eb-175c1410ca50'::uuid, 'Group 4 - Gray Wolves'),  -- LAGARE, NOEL LANTACA
    ('dd516ed7-21b2-4e21-955c-071ba85a374d'::uuid, 'Group 4 - Gray Wolves'),  -- LAPIZ, MARY GRACE ROSAL
    ('d497b98e-b91f-4d78-931c-03ea16dab01a'::uuid, 'Group 7 - Purple Peacocks'),  -- MAG-USARA, CELESTE BARAYA
    ('3de01f45-959d-4bb2-81bd-5ac35cb1b03a'::uuid, 'Group 1 - White Rhinos'),  -- MAJORENOS, JENNYLIE AROBO
    ('a33555ae-70bf-49c8-9362-3bd5129fc8b2'::uuid, 'Group 4 - Gray Wolves'),  -- MIPARANUM, ROWENA JIMOYA
    ('9e26d2d8-cd77-44ae-aa96-5ffb29187fc6'::uuid, 'Group 1 - White Rhinos'),  -- MURALLON, DICK LOMARDA
    ('58a10ad8-8987-401c-bd3f-504b58b24092'::uuid, 'Group 3 - Yellow Vipers'),  -- PAPA, RUBY DUMANJUG
    ('96ace86c-80ca-4977-ad14-2483d95cf083'::uuid, 'Group 2 - Pink Flamingos'),  -- RONQUILLO, ROLANDO DELA CERNA
    ('dc4fa27e-8fc2-4333-bf15-2473ec4e2412'::uuid, 'Group 2 - Pink Flamingos'),  -- TARCULAS, ROSANEL BRIONES
    ('87f5eab3-dc3c-47a5-86f8-939087549f1b'::uuid, 'Group 4 - Gray Wolves'),  -- BADAL, MARCUS ANTONIUS BACATAN
    ('b66b730d-45db-47d0-8bca-505b31619f68'::uuid, 'Group 3 - Yellow Vipers'),  -- BALBUTIN, JEFFREY JAYLO
    ('9ac47e1b-1da1-4891-8407-0dfcb803f6de'::uuid, 'Group 8 - Orange Tigers'),  -- BENDIJO, ELMER CEBALLOS
    ('36670ec5-d636-45de-8070-f885480fc942'::uuid, 'Group 5 - Blue Sharks'),  -- COBONG, KRISTAN JED GATOC
    ('3ad063b8-887d-4424-89c1-f92baa3338a2'::uuid, 'Group 2 - Pink Flamingos'),  -- DELOS SANTOS, BRYAN SEBIAL
    ('c845a3ea-9068-4f31-8774-1744e60697fa'::uuid, 'Group 6 - Red Foxes'),  -- GUARIN, PEDRITO REPOLLES
    ('e417e84a-36e0-40fe-9cba-0ca3b7cbfb37'::uuid, 'Group 2 - Pink Flamingos'),  -- PULALON, FRITZIE TOMADA
    ('7f832935-5c42-43b2-a345-98970ce34822'::uuid, 'Group 6 - Red Foxes'),  -- VILLANUEVA, CELESTINO BACUS
    ('0edd4124-8814-4859-b56a-9f3cdb258876'::uuid, 'Group 3 - Yellow Vipers'),  -- BELIOT, LEYGIE SOLATORIO
    ('433f5c16-11a1-4c44-9882-880ee94fcac8'::uuid, 'Group 1 - White Rhinos'),  -- CASINTO, RUBY BATION
    ('aa2a578e-471a-48d6-be0d-b2a6972d18ef'::uuid, 'Group 6 - Red Foxes'),  -- CAMACHO, BELJING MARCON SISO
    ('5cc2d12b-2de2-40e8-9c02-5d08f783c932'::uuid, 'Group 7 - Purple Peacocks'),  -- DELA CERNA, ALEX PABILLARAN
    ('c2af11bf-1930-4e34-b1fa-c2df83ecec1a'::uuid, 'Group 1 - White Rhinos'),  -- DURIAS, ALBERTO MAQUILING
    ('38fb10c5-efe6-4fd6-83fd-b63e39179f2c'::uuid, 'Group 4 - Gray Wolves'),  -- LACIDA, FAYE SITCHON
    ('148c7b54-538a-44b0-8ab3-f38e07f6eb26'::uuid, 'Group 5 - Blue Sharks'),  -- LAUSA, DESIREE BATCHAR
    ('ae4087c8-eed4-483d-839b-a19946183459'::uuid, 'Group 1 - White Rhinos'),  -- LEYNES, JEAN BAGUIO
    ('454d3789-1ead-4dba-ac53-ba7bccca1308'::uuid, 'Group 8 - Orange Tigers'),  -- LLANOS, LINOEL ENGRACIA
    ('379660a2-6624-4c1a-921e-6b1f8f6e0aa5'::uuid, 'Group 1 - White Rhinos'),  -- OBOD, LUCRIS ENOMAR
    ('2c2d10d9-6501-44b9-a6a3-877d98be230a'::uuid, 'Group 8 - Orange Tigers'),  -- REDOBLADO, ROBERT BACUAJON
    ('72b34733-c539-4053-91a5-effa4db619c7'::uuid, 'Group 6 - Red Foxes'),  -- ROBANTE, JAY-AN BALORAN
    ('49a88a57-0639-4601-ae39-9a886cbd659d'::uuid, 'Group 5 - Blue Sharks'),  -- SUMANGKILAY, BENJAMINA PETRAS
    ('794b165e-ad46-4fae-9c74-96218559df33'::uuid, 'Group 8 - Orange Tigers'),  -- ORCULLO, ISCEL MAY JALALON
    ('fb6c6132-7996-43a5-947d-24ccc508592b'::uuid, 'Group 7 - Purple Peacocks'),  -- PRIETO, GRECHEME TUANGGANG
    ('56f62581-c554-49f5-9f93-c4fc22c3d6a2'::uuid, 'Group 3 - Yellow Vipers'),  -- MANGINSAY, MARC RICARDO
    ('2a28d7ca-5a08-41e2-ac75-aa5c89de5404'::uuid, 'Group 7 - Purple Peacocks'),  -- BARCELO, JOSEPHINE PANAL
    ('4e183a2b-6378-4923-870c-2341898bb37c'::uuid, 'Group 2 - Pink Flamingos'),  -- CANDAWAN, REY IMPANTADO
    ('4a4acb08-fd7c-4a0a-aa7f-7e3f2abc641f'::uuid, 'Group 8 - Orange Tigers'),  -- JEROSALEM, RICARDO REVOZADO
    ('391b1648-a269-42f0-b312-fddb0b93c6d0'::uuid, 'Group 5 - Blue Sharks'),  -- SALIGAN, LEONARDO RADA
    ('d90e6a5d-78ec-4c99-8c87-320a20b76e9c'::uuid, 'Group 2 - Pink Flamingos'),  -- JAVIER, LOIDA TEJADA
    ('82054de8-8607-4b92-82f9-a01ad7cc4cad'::uuid, 'Group 3 - Yellow Vipers'),  -- KAAMI&#209;O, ANTONIO MARATA
    ('14869220-4690-47f4-b36e-7e84cf1f4a88'::uuid, 'Group 8 - Orange Tigers'),  -- ILUSORIO, JENILIN FUENTES
    ('6b82bc41-3989-4173-a4ce-f94749b9eefe'::uuid, 'Group 6 - Red Foxes'),  -- FILIPINO, CHRISTINE BARCOMA
    ('fe458b4f-b0ce-478f-8c84-b39ab7fd3ab8'::uuid, 'Group 1 - White Rhinos'),  -- LAO, ROBELITO HOYOHOY
    ('3d458f0f-970f-4bbe-ab90-42fd36f36854'::uuid, 'Group 8 - Orange Tigers'),  -- CARDENAS, ALEX ROA
    ('e71b93ee-0d1d-4f55-8566-ee137cdfa83e'::uuid, 'Group 8 - Orange Tigers'),  -- LAPIZ, SILVISTRE ARADOC
    ('17dc55f3-ab81-4baa-b339-aecd3afa08fa'::uuid, 'Group 4 - Gray Wolves'),  -- MAGHANOY, MORLANDO ER-ER
    ('fb097325-a123-4ce9-9b50-ddaa8f20a462'::uuid, 'Group 2 - Pink Flamingos'),  -- MARTINEZ, FRANCISCO SISTOSO
    ('29bec02b-73b0-43d5-b0bc-aaa1780bd173'::uuid, 'Group 4 - Gray Wolves'),  -- ONIOT, EDGARDO PIEDAD
    ('6ab91224-c3ff-4188-8f92-bd7d7a5ca32f'::uuid, 'Group 6 - Red Foxes'),  -- ARDON, ZACARIAS BUSCATO
    ('ac7c3780-7c69-4432-8faa-68857bfc797f'::uuid, 'Group 1 - White Rhinos'),  -- AUMAN, MARJORIE ORTEGA
    ('489eab61-879a-4e07-a327-d1b58d83c0b6'::uuid, 'Group 5 - Blue Sharks'),  -- AVILA, EDDIE CORRE
    ('d47d56a7-53d1-473c-8077-53966bd05feb'::uuid, 'Group 4 - Gray Wolves'),  -- BALBUTIN, DANIEL OLAER
    ('e2e14e43-dbe9-483b-8838-559607f663ba'::uuid, 'Group 1 - White Rhinos'),  -- BARCELO, TEODORO DIACAMUS
    ('f0f38320-327b-4656-88fa-cd061717605a'::uuid, 'Group 6 - Red Foxes'),  -- BATION, ARLEEN PANG-AN
    ('bd098802-acbc-4ae1-aa34-b06a06d9632b'::uuid, 'Group 7 - Purple Peacocks'),  -- BIENES, FERDINAND NAVALES
    ('b7cc58e8-02a9-4173-befd-572a27aa3d75'::uuid, 'Group 5 - Blue Sharks'),  -- CREDO, BENNY PONCE
    ('08d56da8-2c29-461e-88e2-5652d5ac1f51'::uuid, 'Group 2 - Pink Flamingos'),  -- CUAY, LESLIE TABAN
    ('7606b695-0ac8-43ac-bdd7-4b83b9e5bc95'::uuid, 'Group 7 - Purple Peacocks'),  -- FERNANDEZ, ALLAN BRACHO
    ('9fa595a0-6211-4604-8387-827d044f05f6'::uuid, 'Group 2 - Pink Flamingos'),  -- FERNANDEZ, WILSON MAURILLO
    ('aafe448a-4238-4626-bcd1-d0fc43433fa4'::uuid, 'Group 7 - Purple Peacocks'),  -- PIEDAD, POLICARPO TAN
    ('e59cfd8e-622b-4b89-b253-2f3a67237cbc'::uuid, 'Group 1 - White Rhinos'),  -- PREMACIO, DINDO ATAD
    ('a8b571c2-f012-417e-a161-a4f54df325e0'::uuid, 'Group 1 - White Rhinos'),  -- PUELAS, JONATHAN SEARES
    ('d0fad659-1d99-4aa1-8877-367cb9ad9b95'::uuid, 'Group 5 - Blue Sharks'),  -- ROSALES, OMAR JOSE ROSAURO
    ('c2dad1c1-c85e-4b37-88c7-2cb0879b2d88'::uuid, 'Group 1 - White Rhinos'),  -- SALVADOR, ANNABELLE VALE
    ('5a530458-cdef-4fb6-b3d6-fa11178db507'::uuid, 'Group 1 - White Rhinos'),  -- SARMIENTO, TITA TAGALOGUIN
    ('d1255821-e3a9-4532-8214-07a7cda5b0e7'::uuid, 'Group 7 - Purple Peacocks'),  -- SILA, RAMIL JIDA
    ('a17dce17-4d7e-46b9-885b-8b24e4079c48'::uuid, 'Group 4 - Gray Wolves'),  -- TANJAY, ARVIC DAHUNAN
    ('1cb5929e-73ba-4c96-a300-7b8f8f4f3722'::uuid, 'Group 1 - White Rhinos'),  -- TAPAYAN, MARITES OLORES
    ('1748d39e-3ccf-43bb-a154-26c594ec441c'::uuid, 'Group 1 - White Rhinos'),  -- TAYAG, MARK DASMARI&#209;AS
    ('36d3de04-6c82-4ee0-9bd3-a00397c2ce61'::uuid, 'Group 2 - Pink Flamingos'),  -- TIGOLO, JIMMY PLIEGO
    ('ae5534d3-99cf-419f-8616-cfde92a25965'::uuid, 'Group 3 - Yellow Vipers'),  -- ZOSA, MINERVA AJOC
    ('53afc7cb-770a-4b18-9aba-dc4cbae7418b'::uuid, 'Group 6 - Red Foxes'),  -- MAHAWAN, LITO CANDAWAN
    ('04a18cf9-fd02-4626-aa8e-471dbef5b3ab'::uuid, 'Group 3 - Yellow Vipers'),  -- CA&#209;O, JERSON DAMOAG
    ('84777785-5b05-4e7b-b392-eb8f5b84f101'::uuid, 'Group 8 - Orange Tigers'),  -- AQUINO, RODOLFO MALALIS
    ('1192d316-8ee5-48d0-baad-fc6d4e41aa09'::uuid, 'Group 6 - Red Foxes'),  -- SAPAR, RONITO PONCE
    ('283fb435-1933-42fc-a42b-caf77e165a56'::uuid, 'Group 7 - Purple Peacocks'),  -- INDOC, ROLANDO ABAJAR
    ('3e2aed48-10a7-4ae4-92bc-7ae438ecb557'::uuid, 'Group 5 - Blue Sharks'),  -- MATA, CHRISTINE CEBALLOS
    ('9e45b14c-972b-463f-a020-30e822f277ac'::uuid, 'Group 2 - Pink Flamingos'),  -- KAAMI&#209;O, ENRICO PENAS
    ('9b440913-ce26-4ca7-b261-bf2d2811e4cd'::uuid, 'Group 8 - Orange Tigers'),  -- PADILLA, JOCELYN OCIONES
    ('9dd23e7c-53a4-479e-842b-4c6592a469c4'::uuid, 'Group 3 - Yellow Vipers'),  -- LAGO, HERMES LUMAYAGA
    ('ce207832-f393-463d-a745-1c9df51ca812'::uuid, 'Group 4 - Gray Wolves'),  -- LAGRIMAS, FELIX CALUPEZ
    ('7478f2e8-6ef1-43d3-b803-58cd2d10ca4c'::uuid, 'Group 3 - Yellow Vipers'),  -- LARAGA, MARY ANN CAJAN
    ('f0c43101-7614-4ee1-9790-164302061369'::uuid, 'Group 2 - Pink Flamingos'),  -- LERIA, NIEVES MEJICA
    ('e03bb86b-3ea2-46cc-931f-b0743499ef3e'::uuid, 'Group 6 - Red Foxes'),  -- MEDINA, ANNA DYNDEE BANAWA
    ('93117615-b6e4-48b8-a59d-579e8cfe958d'::uuid, 'Group 1 - White Rhinos'),  -- ACAPULCO, NOEL PILONE
    ('5c19c24a-f797-4a0a-b93d-61d3982e0384'::uuid, 'Group 6 - Red Foxes'),  -- AROBO, LADY LEYSON
    ('e57002ba-1c59-4aac-88b8-eea82a5e68b1'::uuid, 'Group 3 - Yellow Vipers'),  -- BITAY, JUBELYN GACASAN
    ('62e65100-1842-432e-9fe5-7b76fda8aa27'::uuid, 'Group 5 - Blue Sharks'),  -- BLANDO, IMELDA CABRERA
    ('5e2241c5-878d-4d48-9467-9a50822b33e9'::uuid, 'Group 6 - Red Foxes'),  -- BULATETE, ROY CABRERA
    ('ea7e4138-c31c-4de1-8dc7-86a24f7aeefb'::uuid, 'Group 7 - Purple Peacocks'),  -- CADOSALES, RENATO MICAYLE
    ('a74b05f1-2335-4282-b6f2-a40c5ce43dcd'::uuid, 'Group 2 - Pink Flamingos'),  -- CAGOCO, CHRISTOPHER PAREDES
    ('c1241db9-7639-41aa-ad87-33ca4a7cc1d1'::uuid, 'Group 6 - Red Foxes'),  -- CANDONGO, NOLAN CULANAG
    ('235ead67-4493-48de-87bd-5205ef028d0a'::uuid, 'Group 4 - Gray Wolves'),  -- CASTILLON, ROMEL GACANG
    ('ccc8bf9b-a41e-4bd1-8efa-c504110479b9'::uuid, 'Group 6 - Red Foxes'),  -- DELICA, EUGENIO HERMOSO
    ('866a4a5d-d117-4aab-acde-c2aa3cca0831'::uuid, 'Group 7 - Purple Peacocks'),  -- DELOS SANTOS, MARK ABING
    ('25dc4549-3bb3-413c-99a8-e10149bf4e3f'::uuid, 'Group 5 - Blue Sharks'),  -- EGBUS, WILFREDO TESORO
    ('8facdfc6-7985-46d6-9d9e-90365e41cf9c'::uuid, 'Group 5 - Blue Sharks'),  -- GALLEPOSO, SHERALOU ANDO
    ('d51506cf-794b-4970-b82d-1a3e630e4fc2'::uuid, 'Group 7 - Purple Peacocks'),  -- GOMONID, EDWIN CARREON
    ('4cecc8ee-e5cc-4b81-abce-4931b7540a4d'::uuid, 'Group 2 - Pink Flamingos'),  -- GUMAPAC, QYM EMBUSCADO
    ('90a37f20-2e7e-42bf-a201-c69c22e1532b'::uuid, 'Group 7 - Purple Peacocks'),  -- HESULER, BELINDA RODA
    ('347ced6d-05ed-462a-9848-0a84f9af8a82'::uuid, 'Group 4 - Gray Wolves'),  -- PALALLOS, FE LABRADO
    ('4041cdd9-01b1-46a2-9bc7-e6a32f3be215'::uuid, 'Group 3 - Yellow Vipers'),  -- PALANAS, RONALD MALAUBANG
    ('0f1af624-312d-49b9-83ba-60ed1eb84fcc'::uuid, 'Group 1 - White Rhinos'),  -- PAMAYLAON, ROLY JAMITO
    ('8e16f9cb-4065-453a-8cdf-332e119fd80b'::uuid, 'Group 6 - Red Foxes'),  -- PLANGCA, SERGIO SUSME&#209;A
    ('bae583c4-dd86-44c0-a026-27f448c53e2f'::uuid, 'Group 6 - Red Foxes'),  -- REBUTAZO, EDUARDO APOG
    ('0bfe15f1-d83e-441f-b9f6-590d2c0ab2f0'::uuid, 'Group 2 - Pink Flamingos'),  -- SUAZO, JULIUS STEVE ANOR
    ('c1d9aa8e-2081-413b-9376-218cdfe6ede9'::uuid, 'Group 3 - Yellow Vipers'),  -- TAMPARONG, JHOANALIZA BUGSOCAN
    ('1040c335-34f6-4e09-a150-5199f915b0ed'::uuid, 'Group 6 - Red Foxes'),  -- LAPINIG, EDELIZA BENDIOLA
    ('a4d1361b-6d89-4b66-b169-02f9f340709c'::uuid, 'Group 2 - Pink Flamingos'),  -- SUANA, JOCELYN DAGANDARA
    ('f3d07f99-d444-4571-ad62-7b1e3c36a5bc'::uuid, 'Group 2 - Pink Flamingos'),  -- SURDILLA, JAMES PACARRO
    ('bba5df27-4af0-4c95-acc9-529ff04b5cb7'::uuid, 'Group 8 - Orange Tigers'),  -- TAGAL, MERGIAN CHRIST ABUCAY
    ('d11ae242-1f17-4435-bc67-ee04f315823e'::uuid, 'Group 6 - Red Foxes'),  -- RAMAYRAT, RODIL EMEPANIA
    ('f975d6fd-c978-4001-805b-1932790a33ee'::uuid, 'Group 3 - Yellow Vipers'),  -- ABANGAN, JEFFREY JAYOMA
    ('2ad86384-2e6c-44df-b329-03653d43a0c8'::uuid, 'Group 1 - White Rhinos'),  -- FUENTES, ALWIN PAROJINOG
    ('dc9a0bc4-8e59-47fb-ad88-6f3c0864ba25'::uuid, 'Group 3 - Yellow Vipers'),  -- DELA PE&#209;A, ELEUTERIA SAMBOLAN
    ('42b9572a-6316-4023-ab91-10b8fd6f1b80'::uuid, 'Group 3 - Yellow Vipers'),  -- BALCITA, JOEL ANISLAG
    ('1b597812-867e-432d-9fcb-a30ea25702cd'::uuid, 'Group 5 - Blue Sharks'),  -- BABAYRAN, NESIE JANE BEDASUA
    ('bb78a318-a8ff-4f7e-9b9c-76913c080a51'::uuid, 'Group 8 - Orange Tigers'),  -- CATUBIG, JORGE LARGO
    ('75c1e80c-f488-4a7c-ae11-1c675b403973'::uuid, 'Group 8 - Orange Tigers'),  -- FRASER, CHRISTINE GARCIA
    ('96728df5-1869-4c52-8975-e7bcf54585f0'::uuid, 'Group 2 - Pink Flamingos'),  -- FUENTES, REY BALA
    ('d334aacb-8ea3-4ef9-9bca-f30cae565ad6'::uuid, 'Group 3 - Yellow Vipers'),  -- SUAN, ELVIN ALCARIA
    ('62e8a558-f292-48ec-94b9-681531fa7d9a'::uuid, 'Group 2 - Pink Flamingos'),  -- ABELLANIDA, IAN BENITO
    ('c9e0f735-df1b-4498-b504-ebcbdce4f28b'::uuid, 'Group 4 - Gray Wolves'),  -- ACU&#209;A, ERLINDO MANSING
    ('a3a26efe-9a89-447d-b649-1ca30d268701'::uuid, 'Group 2 - Pink Flamingos'),  -- AVES, MAILENE BALCITA
    ('138173a5-b4bd-4df3-be96-61a0970ba5d5'::uuid, 'Group 6 - Red Foxes'),  -- CALDERON, LINO DELA PE&#209;A
    ('daf44f88-6e79-40a2-ac56-ebb687558892'::uuid, 'Group 3 - Yellow Vipers'),  -- CA&#209;AMO, ENECITA ANTOQUE
    ('09344f9e-9768-4a95-8199-6d3480becde5'::uuid, 'Group 8 - Orange Tigers'),  -- CARTAJENAS, ELEUTERIO APOG
    ('12ebf090-4578-4c38-87ea-81153676b58a'::uuid, 'Group 5 - Blue Sharks'),  -- CORTEZ, ALAN JIMENEZ
    ('55b4ac62-6562-43cd-b151-6792410ed8ec'::uuid, 'Group 3 - Yellow Vipers'),  -- DE TORRES, RODOLFO BAZAR
    ('605fbf46-3fa8-4afa-8d28-28eb170ca593'::uuid, 'Group 2 - Pink Flamingos'),  -- DENORE, TEODORA CALAJAT
    ('a00328ff-7914-4753-a8e6-d2b05f7cf084'::uuid, 'Group 2 - Pink Flamingos'),  -- DIAZ, ELIZABETH SARABIA
    ('1c06e93f-b2a2-4678-b32e-cd3fd9ba91a8'::uuid, 'Group 8 - Orange Tigers'),  -- ENGRACIA, NARNE LEONARDO
    ('3ae1bb68-3991-4407-ac31-c148e1c93a46'::uuid, 'Group 2 - Pink Flamingos'),  -- ERQUITA, ERNESTO AGUSTIN
    ('c7c393d7-1e0f-47bc-973f-37eb585a37e8'::uuid, 'Group 8 - Orange Tigers'),  -- GABATO, LEOMAR NALUPA
    ('3a951d47-568e-4b86-85fc-053ea3d60399'::uuid, 'Group 3 - Yellow Vipers'),  -- GUISADIO, ANIBON TAMPARONG
    ('484cf12d-2940-48e2-ae10-345175cc878c'::uuid, 'Group 4 - Gray Wolves'),  -- JALALON, CESAR BERJAME
    ('8265b7b0-a5e3-48b3-95db-840b67a4b6cc'::uuid, 'Group 6 - Red Foxes'),  -- LAUSA, ANDRES ALEGRADO
    ('a76a7dae-4cf3-47f0-8fbd-69ef3f56da4b'::uuid, 'Group 4 - Gray Wolves'),  -- LIMBAGA, ANA LOU YUSORES
    ('23b9bf2c-f702-46c3-9a3b-08b18dd8ffc6'::uuid, 'Group 4 - Gray Wolves'),  -- OMPOC, JIMMY BONALOS
    ('7778a83b-3f5a-4a45-9887-ccb64e5fd32c'::uuid, 'Group 4 - Gray Wolves'),  -- PABATAO, CRIS LUMACTOD
    ('e0ff2030-0456-4128-a06d-218a41a9f1eb'::uuid, 'Group 7 - Purple Peacocks'),  -- SALVIA, ARNOLD TORIBIO
    ('f260067e-c043-4f66-96b4-4bbea0a35fe7'::uuid, 'Group 8 - Orange Tigers'),  -- SANCIANGCO, WINIFREDA ARANAYDO
    ('a7b4825c-42bf-430d-bad3-e025b3ae8b3c'::uuid, 'Group 1 - White Rhinos'),  -- SANICO, ROBERT GUBOT
    ('d09597c6-8346-4c09-bcfd-b84760ef15e1'::uuid, 'Group 7 - Purple Peacocks'),  -- SAQUIN, CELART SUPERABLE
    ('f9b9dce7-6189-4186-b508-48e28b2adff7'::uuid, 'Group 5 - Blue Sharks'),  -- SUMONDONG, MARIBETH TAGUISA
    ('95fc48d6-20d8-400d-95d7-bb95d6b9fa18'::uuid, 'Group 6 - Red Foxes'),  -- VASAYA, JOCELYN MERO
    ('4abd3d9b-b566-4ca7-bf24-e0eb69fcca6b'::uuid, 'Group 6 - Red Foxes'),  -- CALOPEZ, CHERRY FE MATCHON
    ('86008f03-ac3c-4ad7-ad56-3a1df80bfadb'::uuid, 'Group 8 - Orange Tigers'),  -- GUTIERREZ, JULITO VILLACRUZ
    ('d111997f-f22e-4dab-b082-e2f8ed7d456b'::uuid, 'Group 2 - Pink Flamingos'),  -- ENTERA, DANNYBOY OTOM
    ('2ff6257a-2fe5-4e07-b5ee-8a02926103f8'::uuid, 'Group 3 - Yellow Vipers'),  -- DELPOZO, SARAH PAROJINOG
    ('0f40b879-083b-4011-a681-2f26cfd7676b'::uuid, 'Group 2 - Pink Flamingos'),  -- GAHIT, ANDY MILLAN
    ('6c7fd89d-4e5e-4c8e-b3e7-25b9c48b3aa2'::uuid, 'Group 6 - Red Foxes'),  -- ORIGENES, RAUL CARVAJAL
    ('7378c8d8-e64b-4f67-ab86-1121f1ac6493'::uuid, 'Group 3 - Yellow Vipers'),  -- ALBISO, MARY THERESE OBINA
    ('c9d44e81-3784-4108-b31f-9686a2dbcc3a'::uuid, 'Group 6 - Red Foxes'),  -- OAMINAL, SANCHO SEVILLA
    ('8c77fca0-67d0-411f-b944-b52560db405b'::uuid, 'Group 5 - Blue Sharks'),  -- ACAPULCO, RODNEY BOOC
    ('e696bf18-d38a-41a1-92c4-804a96e86509'::uuid, 'Group 7 - Purple Peacocks'),  -- AMONGOS, ARNEL LOPEZ
    ('f780f4ca-76cd-4228-b014-f6e9ed4d2626'::uuid, 'Group 8 - Orange Tigers'),  -- ASOY, MILA EBARYAL
    ('bdcfae6e-5016-4fbd-bea4-f020be904584'::uuid, 'Group 7 - Purple Peacocks'),  -- AVES, ENGELBERT ABELLO
    ('e284ec5e-dc4d-447c-9b2b-4645c41a58ae'::uuid, 'Group 1 - White Rhinos'),  -- AWID, RAMIL MEMORACION
    ('9c759129-32a3-45a1-bfdb-2859258c79bd'::uuid, 'Group 4 - Gray Wolves'),  -- BARRIOS, EMMANUEL ALEXANDER ANG
    ('0dc14f0e-a982-44b8-94e1-24b271f9bf1d'::uuid, 'Group 3 - Yellow Vipers'),  -- BLANDO, EDUARDO EDILO
    ('4daa1151-eb1f-495d-8cbc-99a59fa0a206'::uuid, 'Group 1 - White Rhinos'),  -- CABANIT, ROSEMARIE VASAYAS
    ('48b3937c-f811-4415-9eb7-adb2e2134148'::uuid, 'Group 7 - Purple Peacocks'),  -- CAMUS, JOSUA CANILLO
    ('e8950b09-4d59-4e31-9d86-0ced08313b1a'::uuid, 'Group 4 - Gray Wolves'),  -- CLEMENCIO, MELCHOR UDTOHAN
    ('6ea7354e-fc9d-42b4-8460-288a19cdd923'::uuid, 'Group 3 - Yellow Vipers'),  -- DAG-UMAN, RICARDO RAMONAL
    ('70884642-2415-4cc8-baa5-b39e59b0ea0e'::uuid, 'Group 3 - Yellow Vipers'),  -- DUHILAG, PETER SEGOVIA
    ('9b336100-2b13-4655-855e-bf2833fb9706'::uuid, 'Group 1 - White Rhinos'),  -- EMOL, CHARIE DUHAYLUNGSOD
    ('69db63b4-a9a9-444f-87ff-60a55d7aab60'::uuid, 'Group 1 - White Rhinos'),  -- JALA, ERNES GAMBOA
    ('3f2b4c04-1fd6-488c-9eaf-553681ba40fd'::uuid, 'Group 7 - Purple Peacocks'),  -- MAGDADARO, MARCLENN AGANOS
    ('a117d218-361c-4f35-8792-23d9d3cbae18'::uuid, 'Group 8 - Orange Tigers'),  -- MANAGO, WALTER CAGANDE
    ('62cfe195-436c-45ad-9218-74cec7fe707c'::uuid, 'Group 2 - Pink Flamingos'),  -- MIPARANUM, RONILLO TAPAYAN
    ('9e7372a7-3205-49c4-8a9d-a2d557551f5b'::uuid, 'Group 7 - Purple Peacocks'),  -- OSMAN, CAMILO BOHOL
    ('fcf4437a-2059-4f8a-82dc-8fb5f8a7ebad'::uuid, 'Group 1 - White Rhinos'),  -- PALON, JOHNDEE PADILLA
    ('a9734dd4-5e10-47cd-8072-7e79945141a1'::uuid, 'Group 4 - Gray Wolves'),  -- TAMULA, JOCELYN MATCHON
    ('495f9f65-a25c-4560-820b-f715694c2d4e'::uuid, 'Group 4 - Gray Wolves'),  -- FERNANDEZ, JECK PAUL CARTAJENAS
    ('7e954df6-657a-4652-9335-c2cf195cd8ee'::uuid, 'Group 6 - Red Foxes'),  -- ESPENIDO, JEMBOY PAPAYA
    ('98238ab8-92a2-4030-b2f1-8c6d8aa3cac3'::uuid, 'Group 3 - Yellow Vipers'),  -- DUMANJUG, FERNANDO GAMBOA
    ('160715e3-868c-498f-a5c4-561b3c3c23ab'::uuid, 'Group 8 - Orange Tigers'),  -- MAATA, BRENDA ESDRELON
    ('06cf80d2-9428-4445-8b8e-c441a748fa87'::uuid, 'Group 7 - Purple Peacocks'),  -- TAPAYAN, MARIA LIZA ALEGRADO
    ('27fef688-0a50-4ff6-b7c0-fc34c68eda5c'::uuid, 'Group 3 - Yellow Vipers'),  -- PERALES, HILDA DUMPOR
    ('0e6ac8d9-26d2-4ac1-bd34-94b9a897dc91'::uuid, 'Group 4 - Gray Wolves'),  -- CONDE, KAY CIPRES
    ('57cf9eec-5dfe-4593-ad40-5b98d727e646'::uuid, 'Group 6 - Red Foxes'),  -- RONQUILLO, LIZEL REGIS
    ('a5c7408d-67e8-4a75-b87d-1c406af4380f'::uuid, 'Group 2 - Pink Flamingos'),  -- BADONG, EDEN OBUT
    ('7dd7bc25-0e3d-495f-bdce-98cf9de7ba92'::uuid, 'Group 6 - Red Foxes'),  -- LOMOLJO, CHERELY PALANG
    ('03826f06-d2ea-4aa6-af83-77e169f9bf0e'::uuid, 'Group 8 - Orange Tigers'),  -- ACAPULCO, DAVID LARRY CABANOG
    ('2d2d7509-16ef-4750-ac7b-27a0bd84956a'::uuid, 'Group 3 - Yellow Vipers'),  -- SAGARIO, MARGIENOMA DIAN
    ('95048011-87e7-4609-93a6-024f085c2ab8'::uuid, 'Group 8 - Orange Tigers'),  -- MABANAG, NANSEL NAVARRO
    ('0ff128f7-f7be-48a7-a131-a2dbf6ae510b'::uuid, 'Group 1 - White Rhinos'),  -- SEHOB, PEARL GRACE JARA
    ('ba77ad16-9fbb-4e2a-bba9-51b3f17e4299'::uuid, 'Group 8 - Orange Tigers'),  -- BARGAMENTO, MARIA LILIBETH REGIS
    ('7afcfbb5-962e-416c-a844-263064ea7118'::uuid, 'Group 5 - Blue Sharks'),  -- ALEGRADO, DINA SUEDO
    ('c181868e-55cb-4f60-81bf-3c98e06f422f'::uuid, 'Group 1 - White Rhinos'),  -- ORIGENES, RYAN MARK OBINA
    ('9a16047c-f449-41ce-9f09-9b9f5d30e343'::uuid, 'Group 3 - Yellow Vipers'),  -- BERINGUER, REINA MAE SABELLANO
    ('5a151d2d-0569-469d-96bc-4a53271b67fb'::uuid, 'Group 5 - Blue Sharks'),  -- LABASTILLA, GRACE LOVE RAAGAS
    ('f9355d44-ac73-4e4e-9b52-caf6cf626410'::uuid, 'Group 5 - Blue Sharks'),  -- CARDONA, JOSELITO AM-IS
    ('cba9dd1c-e2c0-4cda-890e-4d02453e9173'::uuid, 'Group 2 - Pink Flamingos'),  -- DONGGAY, NAOKICHI SERRA
    ('8bf0049b-9498-4ec6-bf6e-ff7b332ed19b'::uuid, 'Group 2 - Pink Flamingos'),  -- REBOTON, MARK ANGELO DORMIDO
    ('2705aa4b-1fa7-4c62-b99c-d072fd3b2210'::uuid, 'Group 4 - Gray Wolves'),  -- LAO, DANICA SHARMAINE BALCITA
    ('1fcab157-69e9-4dbd-b534-dd07f21a74dc'::uuid, 'Group 5 - Blue Sharks'),  -- GIANGAN, ROSCEL OSTIA
    ('de73be19-4922-4966-ab83-cb6491be3fc1'::uuid, 'Group 8 - Orange Tigers'),  -- BELVESTRE, ROTES ESPIGA
    ('bf8ac45e-8c97-421a-9b6d-22d832822b50'::uuid, 'Group 2 - Pink Flamingos'),  -- MANINGO, JASMINE SHANE SAYSON
    ('eb5ca355-c137-4061-bf70-cf6d6ffd3b8e'::uuid, 'Group 8 - Orange Tigers'),  -- TAPAYAN, JEEFIL SEARES
    ('7c63e514-21b3-4b10-9015-f0582e5aecdb'::uuid, 'Group 1 - White Rhinos'),  -- TADLE, TIFFANY MEGAN GARCINES
    ('de12dde2-d402-4b65-99c9-186597f8af46'::uuid, 'Group 6 - Red Foxes'),  -- DAPAT, CHERYL TANCIO
    ('248a46c9-9403-4b39-90f3-689bba91fb7d'::uuid, 'Group 7 - Purple Peacocks'),  -- LUMOSAD, JOY AZCONA
    ('2e57f425-f2c6-43cc-b195-8f34119cb7ec'::uuid, 'Group 7 - Purple Peacocks'),  -- MALAUBANG, MARIA LIGAYA PAGENTE
    ('c4cf2fb7-f7b3-4b58-88d0-978e3b1a88f7'::uuid, 'Group 4 - Gray Wolves'),  -- UY, ANTHONY MORALES
    ('68f1d36c-9736-4814-ae92-7342d15d0a83'::uuid, 'Group 1 - White Rhinos'),  -- LAUSA, JOENEL SEMENE
    ('212e5f6a-b37a-470b-adea-90965cc5a944'::uuid, 'Group 8 - Orange Tigers'),  -- LUANSING, ROSAIDA CLAIRE DIONSAY
    ('63021080-643e-496f-8d17-edd69c085f53'::uuid, 'Group 7 - Purple Peacocks'),  -- AROBO, JEFFERSON CANDONGO
    ('5a8aab0b-c3ff-4e70-b0c5-5bee7a0b4b38'::uuid, 'Group 3 - Yellow Vipers'),  -- OCA, NICASIO MABUYO
    ('59a655dd-ca98-43b6-8380-22277e72637b'::uuid, 'Group 6 - Red Foxes'),  -- ZAPANTA, DANIEL PAULO
    ('9b31459a-9037-489e-a744-41031cff8ecf'::uuid, 'Group 4 - Gray Wolves'),  -- COBRADO, ELIZABETH BALILI
    ('4833ddcf-39c9-4b57-8327-63ee4c0b699e'::uuid, 'Group 2 - Pink Flamingos'),  -- SONER, CARMELA CALAHAT
    ('0f0225c8-90ec-40d2-9a76-55d1a16f2d8f'::uuid, 'Group 5 - Blue Sharks'),  -- LARGO, NIESA MAE BAGUIO
    ('caf249d1-2f17-4a98-8a9d-b254bd53f44d'::uuid, 'Group 5 - Blue Sharks'),  -- BARETA, EDWIN LANSADO
    ('80b17511-1382-4993-88fc-10f8df69fa35'::uuid, 'Group 2 - Pink Flamingos'),  -- BUTALID, EMELITA RAMIREZ
    ('cfdc567f-7fb8-4f7b-b1f0-71b4e6120ed6'::uuid, 'Group 1 - White Rhinos'),  -- MUGOT, OLIVER CINCO
    ('cc3e5ff4-b062-4ea4-8bc6-248856026e8b'::uuid, 'Group 3 - Yellow Vipers'),  -- LOPEZ, ANNA MIE DELOS SANTOS
    ('ccaa19c2-4879-4d57-b035-efa4c0dfe2c6'::uuid, 'Group 2 - Pink Flamingos'),  -- SITOY, GLENN UNOS
    ('f4eb535f-cd91-4d6f-ac2c-3145a6910d18'::uuid, 'Group 3 - Yellow Vipers'),  -- CARILLO, ROCARD REY MATTHEW CADIZ
    ('3ba0700f-6645-401c-9fa8-d18e3ea02c92'::uuid, 'Group 5 - Blue Sharks'),  -- ALDEMITA, SHERYL MAE ABCEDE
    ('498e2f80-e283-4ca7-9ec3-14e8341d0e13'::uuid, 'Group 4 - Gray Wolves'),  -- FRANCISCO, WALTER OZAMIZ
    ('74841988-2a17-4619-bbe1-26de504d12ed'::uuid, 'Group 7 - Purple Peacocks'),  -- CALAHAT, TIFFANY JOY MEJOS
    ('3bbca196-4c49-4fea-900b-2dc3620b5c1e'::uuid, 'Group 5 - Blue Sharks'),  -- ALBURO, ALEXANDER MURALLON
    ('9d1826ac-fa88-4f29-8a7a-963961f9641f'::uuid, 'Group 8 - Orange Tigers'),  -- MU&#209;OZ, ROGER SIMBAJON
    ('c507e4c2-78e1-48e3-9ebc-4bb90ce3d9e0'::uuid, 'Group 3 - Yellow Vipers'),  -- JIMOYA, MARISSA DEIPARINE
    ('f85f29fe-9147-4437-a75e-ee245783e488'::uuid, 'Group 8 - Orange Tigers'),  -- CANDONGO, LYDIA ELICAN
    ('f87c83ce-1368-4554-97d8-036124358810'::uuid, 'Group 3 - Yellow Vipers'),  -- BALUARTE, REY JESUS CANDONGO
    ('e1d3b36f-4ae3-4140-b029-1c5bb0448123'::uuid, 'Group 3 - Yellow Vipers'),  -- GURABEL, FRANCISCO BONDA-UG
    ('677ae8e3-de31-4c17-914e-86bc3f277485'::uuid, 'Group 5 - Blue Sharks'),  -- CIPRES, MELANIE MALAUBANG
    ('54102f05-a2b0-406a-a043-d3e27c81e7bd'::uuid, 'Group 4 - Gray Wolves'),  -- CAMUS, POPEN GRAEFAITH SAMONTE
    ('199c27ba-e641-457b-8ebc-9e28b98ae59d'::uuid, 'Group 7 - Purple Peacocks'),  -- FERNANDEZ, MARICEL JAMBOY
    ('e0852ffd-4cd5-4f00-be09-5a8e4f32e719'::uuid, 'Group 2 - Pink Flamingos'),  -- DULA, MELANIE PEQUIT
    ('eadc4459-dea7-4f03-931b-fe9178b975bf'::uuid, 'Group 3 - Yellow Vipers'),  -- ENGRACIA, LAARNI LEONARDO
    ('661536ec-36bf-4fbf-8b35-a66f86823388'::uuid, 'Group 7 - Purple Peacocks'),  -- JORE, MARJON HERMOSO
    ('e9343e6c-3361-4d2e-9745-d207edb2278d'::uuid, 'Group 8 - Orange Tigers'),  -- SALVADOR, MARICELL PAQUINGAN
    ('6c2a1d21-8a14-4242-80c7-95dc325740f9'::uuid, 'Group 7 - Purple Peacocks'),  -- AMBA, MELICITA FUENTES
    ('3e62a768-da9d-428b-b751-9f2c98ac57a9'::uuid, 'Group 6 - Red Foxes'),  -- DAMO-AG, FELICIANO JIMOYA
    ('2b24bea5-1adf-4f46-91d0-76b7e48f30cb'::uuid, 'Group 2 - Pink Flamingos'),  -- LUMACTOD, ARNOLD MALBUYO
    ('5b3c654a-f79f-4cb9-a966-9c9a96972f23'::uuid, 'Group 2 - Pink Flamingos'),  -- RABALOS, MONALITO RUPINTA
    ('02d22f77-81f3-4b6d-91ae-15e6d9d82b7f'::uuid, 'Group 2 - Pink Flamingos')  -- SARANIOGON, MERCEDITA DAGOY
) AS v (id, csc_team)
WHERE t.id = v.id
  AND t.csc_team IS DISTINCT FROM v.csc_team;

-- ── Job Order — 256 people ─────────────────────────────────────
UPDATE hris.job_order_employees AS t
SET csc_team = v.csc_team
FROM (VALUES
    ('f99bd64e-11a2-44ed-b4c9-ea816d1f2439'::uuid, 'Group 6 - Red Foxes'::text),  -- Aballe, Betsaida M
    ('ab47dad1-6045-4aa6-992f-428079c7b6eb'::uuid, 'Group 5 - Blue Sharks'),  -- Abcede, Julieto M.
    ('60c0b1ba-5fb6-4663-8136-18df48337b64'::uuid, 'Group 1 - White Rhinos'),  -- Abendan, Jonel Galinato
    ('d801d70a-8629-490e-aba0-66506a919dbe'::uuid, 'Group 5 - Blue Sharks'),  -- Abes, Evelyn S.
    ('66354428-c913-4e20-b1b6-f097d8c4e99a'::uuid, 'Group 4 - Gray Wolves'),  -- Acohon, Ricky L
    ('50869e16-3cba-45b8-995a-47217a47aaeb'::uuid, 'Group 4 - Gray Wolves'),  -- Adem, Josephine A.
    ('c07baeb7-e36b-4320-9496-68ab34dad043'::uuid, 'Group 8 - Orange Tigers'),  -- Adlaon, Adelio D
    ('960d047d-7653-473f-852c-8d8033d91662'::uuid, 'Group 5 - Blue Sharks'),  -- Adorna, Fredy P
    ('b3664f2e-37d9-4dde-aeb6-b7ad8e45ce23'::uuid, 'Group 7 - Purple Peacocks'),  -- Agustin, Marcelito D
    ('976cce34-ea56-43ad-acf9-41dda6e1da0c'::uuid, 'Group 2 - Pink Flamingos'),  -- Alburo, Jian Mikha L.
    ('1438da0e-b5ab-4606-9970-fe9d53328b52'::uuid, 'Group 1 - White Rhinos'),  -- Alduhesa, Jessa Mae A.
    ('3d91cf39-e47e-4040-ae6f-87a7d98b658c'::uuid, 'Group 1 - White Rhinos'),  -- Alduheza, Rojemel B.
    ('330b8794-d240-4cbb-b1eb-dd07bcac56eb'::uuid, 'Group 8 - Orange Tigers'),  -- Alegarme, Arvin
    ('c40215fd-7f95-4866-aabc-d234c7e4ac08'::uuid, 'Group 5 - Blue Sharks'),  -- Alegarme, Jerry S.
    ('1e60fc10-97fd-4f72-af72-6efa3aa08c6b'::uuid, 'Group 4 - Gray Wolves'),  -- Alegarme, Randy S
    ('2e6e3e31-fc17-4699-b372-8729c529c8cd'::uuid, 'Group 5 - Blue Sharks'),  -- Alegrado, Erjane T.
    ('4366e20d-6d60-4c05-a484-ae545f649677'::uuid, 'Group 5 - Blue Sharks'),  -- Alegrado, Jocyl
    ('3ae298fe-c090-4623-802b-6f958385a3a3'::uuid, 'Group 8 - Orange Tigers'),  -- Alia, Elyjun T
    ('73ff58b0-5ac0-4b0f-b7d9-33bfc7fb9fe0'::uuid, 'Group 4 - Gray Wolves'),  -- Alima, Reynaldo G. SR.
    ('248ca697-3711-4d79-9bae-bf716292cb05'::uuid, 'Group 8 - Orange Tigers'),  -- Alngohoro, Jan M
    ('957f46e8-35f2-4a01-b88d-4019a2211470'::uuid, 'Group 7 - Purple Peacocks'),  -- Alviar, Christopher L
    ('b5d2b83b-3efc-4aea-a029-f341ae6b6b76'::uuid, 'Group 2 - Pink Flamingos'),  -- Amongos, Judy L.
    ('02ff6bdb-397f-4b9b-872c-30af77f82c9c'::uuid, 'Group 3 - Yellow Vipers'),  -- Amongos, Norben M.
    ('b2f179a7-4bc6-4d79-ae62-42327a7ea24f'::uuid, 'Group 5 - Blue Sharks'),  -- Ancheta, Adolf C.
    ('80e67540-e60e-4d4e-b262-a425166c1ba7'::uuid, 'Group 2 - Pink Flamingos'),  -- Anoos, Rey P
    ('3c576ccb-37da-4c6a-9c70-aea5ca0769ff'::uuid, 'Group 1 - White Rhinos'),  -- Antoque, Jonrey A
    ('8f2846ac-cc8b-4f02-a7ef-72acf836fdf0'::uuid, 'Group 1 - White Rhinos'),  -- Arao, Jeruhme D
    ('ef329826-730c-4e7f-970c-275959ff618e'::uuid, 'Group 6 - Red Foxes'),  -- Araya, Keshia Marie K
    ('37856d1d-3da2-4b79-a139-2274ed89be5e'::uuid, 'Group 4 - Gray Wolves'),  -- Araya, Marian Kristine A.
    ('c1200576-8606-4b76-82d3-5eb9893ac531'::uuid, 'Group 1 - White Rhinos'),  -- Araya, Zardo L.
    ('da134f90-ae11-4c55-a548-1c9f56829f23'::uuid, 'Group 3 - Yellow Vipers'),  -- Arboleras, Alan Michael K.
    ('92791e8d-6e74-4b0f-985e-dd735990feef'::uuid, 'Group 3 - Yellow Vipers'),  -- Arcadio, Benjie R
    ('d70c8080-1b0e-4bca-ad03-07f124b9fe71'::uuid, 'Group 7 - Purple Peacocks'),  -- Atabelo, Nova Mae P
    ('7d599d75-fcb4-4bfa-8b22-48c62e43f7e7'::uuid, 'Group 4 - Gray Wolves'),  -- Bacus, Carolyn S.
    ('a43f1149-df40-4974-bfb5-a72d1c73cf7f'::uuid, 'Group 5 - Blue Sharks'),  -- Bag-o, Jeric S.
    ('ae23aee2-f3e5-4a9e-a30a-1f9445528a12'::uuid, 'Group 6 - Red Foxes'),  -- Balateria, Aldrin R.
    ('5d48ee9f-4a5f-44e3-bae0-2420df3d61cb'::uuid, 'Group 3 - Yellow Vipers'),  -- Barcenilla, Christian M.
    ('01395e46-05bd-4aea-b72c-a9bdfac9aa9e'::uuid, 'Group 7 - Purple Peacocks'),  -- Bihag, Nimfa C.
    ('e2550b06-f6e0-4649-9c26-e2c3652e020c'::uuid, 'Group 1 - White Rhinos'),  -- Boniao, Delia M.
    ('e9166972-c966-4676-9b90-e048e48df5c4'::uuid, 'Group 2 - Pink Flamingos'),  -- Boniao, Mark Vhencyl M.
    ('8bf95562-09cd-4bb1-81d5-63a0ece674b4'::uuid, 'Group 8 - Orange Tigers'),  -- Buna, Elmer B
    ('2658a490-cc43-440f-b0aa-9666852be030'::uuid, 'Group 2 - Pink Flamingos'),  -- Buna, Elthrine John Kei M
    ('4f9fab57-bf63-4bc9-9242-832a9f5260a7'::uuid, 'Group 8 - Orange Tigers'),  -- Butawan, Romel V. Sr.
    ('798bd108-be59-4e8f-beae-eda340ff02b2'::uuid, 'Group 7 - Purple Peacocks'),  -- Cabahug, Jemelyn C
    ('9d350b3d-7385-4ce8-82fc-ab6a260a86aa'::uuid, 'Group 4 - Gray Wolves'),  -- Cabaluna, Rolly C
    ('2a3df8d8-b73a-40af-b810-37ddb3375d1b'::uuid, 'Group 5 - Blue Sharks'),  -- Cabrera, Christian Jan R.
    ('5da59fb4-acf2-4f26-8b6d-5bcb48fe761d'::uuid, 'Group 4 - Gray Wolves'),  -- Cabrera, Rodjie M.
    ('771b1e51-6752-4437-ae83-4f9daaa2c5c7'::uuid, 'Group 6 - Red Foxes'),  -- Cabuco, Reynald O.
    ('56653b01-9c01-4bab-89ed-a3c6a98f557e'::uuid, 'Group 1 - White Rhinos'),  -- Cagas, Bryan T.
    ('7e2e4649-c18c-489e-9ccf-284429670ef7'::uuid, 'Group 5 - Blue Sharks'),  -- Cailing, Elmer Jr. S.
    ('a04a3885-d425-4145-a08d-b35b52af3628'::uuid, 'Group 2 - Pink Flamingos'),  -- Calahat, Eva Maree Joy M
    ('6e0538ff-93c7-4c4e-9e19-6cf68952be16'::uuid, 'Group 2 - Pink Flamingos'),  -- Canete, Lito P
    ('f9f56eb9-fac7-40d2-8025-eca8853493bd'::uuid, 'Group 6 - Red Foxes'),  -- Ca&#241;ezares, Ian S
    ('f5d7039b-6baa-4b6a-a954-03e6dc3f140b'::uuid, 'Group 5 - Blue Sharks'),  -- Capuyan, Melvin Charles Q
    ('54953e30-f7b5-4a9e-902c-b862b37a1841'::uuid, 'Group 3 - Yellow Vipers'),  -- Carangue, Elmer P
    ('e74c8c2d-4f82-4287-aec5-02ebda84d80f'::uuid, 'Group 7 - Purple Peacocks'),  -- Castro, Hannah K.
    ('df62c102-99d5-432d-b3c4-8e39935af707'::uuid, 'Group 7 - Purple Peacocks'),  -- Cimafranca, Ralph Jay G.
    ('cd468839-a85f-4155-9aac-4d858547b862'::uuid, 'Group 8 - Orange Tigers'),  -- Cinco, Danilo A
    ('421f8d95-7ffc-4816-9773-650babceed4e'::uuid, 'Group 5 - Blue Sharks'),  -- Colcol, Marvin R.
    ('535e41c0-569f-47eb-9220-a22dff9404f5'::uuid, 'Group 6 - Red Foxes'),  -- Cortes, Marc Gracious R.
    ('e54cc597-cb8b-4021-b984-919e6eca2651'::uuid, 'Group 1 - White Rhinos'),  -- Cortes, Metchie M
    ('1506985e-6f5c-4a5b-9b9e-dad2a45ba270'::uuid, 'Group 4 - Gray Wolves'),  -- Reyes Richard C.
    ('f04ff7cb-bfad-4442-b4e8-fe8c9730ef26'::uuid, 'Group 6 - Red Foxes'),  -- Culanag, Adeza O
    ('bb8ed78f-6724-4c18-8867-0cabffc43e0d'::uuid, 'Group 1 - White Rhinos'),  -- Dabu, Dick  A.
    ('3fee9066-8a2e-4745-9b60-299e6770f6c6'::uuid, 'Group 1 - White Rhinos'),  -- Dahuyag, Armando C.
    ('9920141c-a814-4d80-8784-424cda4b3cc1'::uuid, 'Group 8 - Orange Tigers'),  -- Daligdig, Lorena A.
    ('8aa9d4b2-a640-4951-afec-1ac18ca31dcf'::uuid, 'Group 3 - Yellow Vipers'),  -- Daloyoc, Joseph Marck G.
    ('c545f985-3c76-41c4-af96-1930358b3ea5'::uuid, 'Group 4 - Gray Wolves'),  -- Dapat, Palmer B.
    ('486a7c1e-0e8c-495f-a5fe-969a310920bd'::uuid, 'Group 5 - Blue Sharks'),  -- Daquizo, Kenjes Ralp B.
    ('510bee1e-c283-4f47-866a-1ea2edd274f8'::uuid, 'Group 6 - Red Foxes'),  -- Decena, Dexter Philip
    ('6e8e5a8d-278f-4548-b2a2-0770db77290d'::uuid, 'Group 2 - Pink Flamingos'),  -- Dela Cruz, Aj John I.
    ('70d9ba91-91e5-4193-9a6d-bf5a356dd02a'::uuid, 'Group 3 - Yellow Vipers'),  -- Dela Pe&#241;a, Edwin S. JR.
    ('f0e2533d-4a43-4340-8a79-719b9f2ef1d7'::uuid, 'Group 1 - White Rhinos'),  -- De Leon, Rona S.
    ('c03762ad-7666-4010-bcd1-06472abde2d1'::uuid, 'Group 4 - Gray Wolves'),  -- Delos Angeles, Romeo Jr.
    ('938767be-2cf7-48c3-bfcb-836492cf0341'::uuid, 'Group 6 - Red Foxes'),  -- Delos Reyes, Jane
    ('007d0006-30bb-4065-82c6-7ab803f866d2'::uuid, 'Group 8 - Orange Tigers'),  -- Detalla, Donna Jane C.
    ('cc6d5d07-c625-4429-9a75-bc9ef73b019c'::uuid, 'Group 2 - Pink Flamingos'),  -- Diagro, Estephen Jake S.
    ('d9e8da89-effc-4892-93ee-8c30e6cd0093'::uuid, 'Group 4 - Gray Wolves'),  -- Dinaga, Mario T.
    ('ff30cf88-f26f-46f9-a49d-0fa604cdf893'::uuid, 'Group 5 - Blue Sharks'),  -- Dinopol, Randy P.
    ('31d5c552-0362-4c59-aed4-e0f50269222c'::uuid, 'Group 5 - Blue Sharks'),  -- Docdor, Daniel P
    ('db131d2f-2e29-4930-bef3-b19fd8f2a695'::uuid, 'Group 5 - Blue Sharks'),  -- Docdor, Lourd S.
    ('29408399-a043-496e-a94c-94f22d860e71'::uuid, 'Group 7 - Purple Peacocks'),  -- Dominguez, Christopher M
    ('9eefab15-4116-42f9-ab2f-3ed1b2b6a246'::uuid, 'Group 3 - Yellow Vipers'),  -- Dominguez, Samantha Monique
    ('7ecbfdec-a135-4c84-94ba-6a366a1775f3'::uuid, 'Group 6 - Red Foxes'),  -- Duran, Ronald S.
    ('bb25b0ac-09c7-4545-8313-9681db1c561c'::uuid, 'Group 3 - Yellow Vipers'),  -- Encallado, Luzmin A.
    ('60415070-d7e2-4357-ac3d-278dad73b28d'::uuid, 'Group 3 - Yellow Vipers'),  -- Enot, Amaita P.
    ('a21f736a-f0d1-4c9e-a603-8100eaea1e49'::uuid, 'Group 7 - Purple Peacocks'),  -- Espenido, Delia O.
    ('da709f9e-41c7-4645-89ae-8af7051f1fd9'::uuid, 'Group 8 - Orange Tigers'),  -- Espenido, Jenson P
    ('192d31ba-bbd8-481a-8a32-b3e442f6897c'::uuid, 'Group 7 - Purple Peacocks'),  -- Espiga, Jamaica L.
    ('1f7c5a2c-2a28-4da0-942f-1dbad44ac138'::uuid, 'Group 5 - Blue Sharks'),  -- Espiga, Renan D.
    ('3e9b6a82-0ed9-44f6-93a0-1937130e3f01'::uuid, 'Group 6 - Red Foxes'),  -- Espinosa, Gideon C  Jr.
    ('39898bfa-b248-4a4c-9af4-1b5281d496a7'::uuid, 'Group 7 - Purple Peacocks'),  -- Espinosa, Gideon C Sr.
    ('87052208-081d-4b5f-bb4c-a30f85a12675'::uuid, 'Group 5 - Blue Sharks'),  -- Fernandez, Jefrey B.
    ('03f950f5-97c4-445b-a572-83ec0c5d3016'::uuid, 'Group 2 - Pink Flamingos'),  -- Fernandez, Oscar L. Jr.
    ('d2a9c5c9-7b46-430c-b6f7-22d187ec8e0a'::uuid, 'Group 8 - Orange Tigers'),  -- Ferrater, Marc Eddelo P.
    ('e954963e-5543-4cdc-8bdd-b8ed6dd4e9a9'::uuid, 'Group 4 - Gray Wolves'),  -- Filipino, Melody B.
    ('c9180726-d47e-485d-8e8c-99b51ca4d311'::uuid, 'Group 7 - Purple Peacocks'),  -- Francisco, Dave P.
    ('293c801c-aae0-4c4d-8603-cfc8c3a77860'::uuid, 'Group 4 - Gray Wolves'),  -- Frigillano, Pauline Kristine A.
    ('5fe017b5-792e-4367-8f4a-de2b17898221'::uuid, 'Group 7 - Purple Peacocks'),  -- Fuentes, Angelica L
    ('232629ad-e9b8-4977-9e46-4a5fa8b641d5'::uuid, 'Group 2 - Pink Flamingos'),  -- Fuentes, Joselito O
    ('008f90e9-bf08-467f-b81b-59bc542230e6'::uuid, 'Group 1 - White Rhinos'),  -- Fuentes, Kin M.
    ('c988978b-86bd-45df-bf6d-f07aaeb75dd9'::uuid, 'Group 6 - Red Foxes'),  -- Gacasan, Christopher S
    ('0af89067-fee1-4139-a093-6ca690a13300'::uuid, 'Group 4 - Gray Wolves'),  -- Gallardo, Glen Ivan T.
    ('be185ba8-36d9-4ddf-ab43-ec6dcf345330'::uuid, 'Group 7 - Purple Peacocks'),  -- Garing, Aljon A.
    ('c980836c-4cfb-4623-b792-bfb5802315e9'::uuid, 'Group 3 - Yellow Vipers'),  -- Gemina, Charry Fe A.
    ('1a868c6b-dc94-470e-a7b8-0515e443d7f3'::uuid, 'Group 4 - Gray Wolves'),  -- Gomonit, Merlyn A
    ('6f912ab0-e547-4e89-b98c-1c010edb3bdd'::uuid, 'Group 5 - Blue Sharks'),  -- Gomonod, Ruben H.
    ('cd2a4a25-bd90-4269-8c3e-6dcda11d510a'::uuid, 'Group 5 - Blue Sharks'),  -- Gonzales, Charles Danish B
    ('f2dcab90-3a58-48e4-a544-33ab17b25002'::uuid, 'Group 3 - Yellow Vipers'),  -- Gordove, Ni&#209;o Mar D.
    ('3e19f48a-a961-4967-8bcf-ae14965f7452'::uuid, 'Group 1 - White Rhinos'),  -- Granada, Elizabeth S
    ('ed850aed-8cce-4857-8362-7fa60653712c'::uuid, 'Group 2 - Pink Flamingos'),  -- Greciones, Joner L.
    ('68c94045-5380-44f5-93cb-7e81f06ff90e'::uuid, 'Group 1 - White Rhinos'),  -- Gulleban, Miraflor E.
    ('01b8f7b0-327a-4766-b684-c1fff5264bb9'::uuid, 'Group 1 - White Rhinos'),  -- Hamili, Jonathan G.
    ('52f6d579-421c-4f8c-a898-900c4fdb027d'::uuid, 'Group 2 - Pink Flamingos'),  -- Hechanova, Antonio Jr.
    ('6dbbf2d4-0a90-4ef3-be85-87aa0c2e94ff'::uuid, 'Group 2 - Pink Flamingos'),  -- Hernando, Lera Grace V
    ('40168325-c905-4ff9-b695-c9bd195cca76'::uuid, 'Group 2 - Pink Flamingos'),  -- Hipolan, Julie V. Jr.
    ('b1681ff1-056f-4aa6-8d25-ceaacede516d'::uuid, 'Group 4 - Gray Wolves'),  -- Hisoler, Ivy D.
    ('933de169-ed2e-40dd-b5e6-15b400499780'::uuid, 'Group 7 - Purple Peacocks'),  -- Indanao, Cheryl G.
    ('e3168344-7deb-4b5d-a02b-24df31107c4d'::uuid, 'Group 1 - White Rhinos'),  -- Itum, Mary Jane D.
    ('5eb6b30a-7240-4000-9257-d08096e6f608'::uuid, 'Group 8 - Orange Tigers'),  -- Jagonia, Yoradyl Zyra
    ('793e4dd4-96ef-4bfa-a3f5-bfc02aa1852b'::uuid, 'Group 6 - Red Foxes'),  -- Jala, Arnel G.
    ('7b892155-26c9-4731-9829-ce26b27e5055'::uuid, 'Group 6 - Red Foxes'),  -- Jalalon, Arvin T.
    ('d63204e3-b740-4ecc-b65c-f3ac0fda88b4'::uuid, 'Group 8 - Orange Tigers'),  -- Jaramillo, Angelo R.
    ('cefa02b2-e740-422d-879d-012c1ace93d3'::uuid, 'Group 7 - Purple Peacocks'),  -- Jaramillo, Gabriel R.
    ('feb10cbe-2dbc-4bf5-8f3c-10b719e880c5'::uuid, 'Group 5 - Blue Sharks'),  -- Jocson, Carmel N.
    ('3f76784b-9087-4d21-b812-dbdc1d5687b8'::uuid, 'Group 5 - Blue Sharks'),  -- Jumawan, Christine Shiella P.
    ('be738ec1-6723-467d-84d4-eb7a9cf38ea8'::uuid, 'Group 8 - Orange Tigers'),  -- Labastida, Gomercito L. Jr.
    ('31c411b6-0169-4aa7-b303-e5ab93c413e9'::uuid, 'Group 2 - Pink Flamingos'),  -- Ladao, Lovella Mae P.
    ('3db34c58-a90f-4508-89b2-4ad83ed049cb'::uuid, 'Group 5 - Blue Sharks'),  -- Lagare, Narciso
    ('3f5fd329-3f7b-4536-8839-c7245cb4100e'::uuid, 'Group 1 - White Rhinos'),  -- Lagrimas, Danilo Jr S.
    ('32bb7a2d-7174-4532-99f8-241339c5ad05'::uuid, 'Group 8 - Orange Tigers'),  -- Lahaylahay, Alona B.
    ('f3076382-b224-4746-a710-63c1dea3a786'::uuid, 'Group 4 - Gray Wolves'),  -- Lapiz, Jeanne C.
    ('9043bbc8-f9f1-4c9d-99f9-368040ad1bf4'::uuid, 'Group 8 - Orange Tigers'),  -- Largo, Conrado
    ('29f3041b-d6e8-4faa-becf-b4d4e267512e'::uuid, 'Group 7 - Purple Peacocks'),  -- Lascuna, Gwynn Shepperd P.
    ('42495821-a857-49f6-ba60-eb246528d97a'::uuid, 'Group 4 - Gray Wolves'),  -- Linsag, Robani Andro M.
    ('d58492a3-ff08-410f-a960-4899f145f81d'::uuid, 'Group 8 - Orange Tigers'),  -- Lobita&#241;a, Lanie A
    ('a381a5d4-ceed-47ee-a744-2cab30007530'::uuid, 'Group 3 - Yellow Vipers'),  -- Somontan George L.
    ('91ab3155-ae88-4193-a707-881c98683b56'::uuid, 'Group 4 - Gray Wolves'),  -- Lumactod, Jonel C
    ('1e96bdea-c588-4f86-9690-68b026163575'::uuid, 'Group 2 - Pink Flamingos'),  -- Lumantas, Meushe Joy T.
    ('b471151a-c832-45f1-9f7b-e5f74f274757'::uuid, 'Group 3 - Yellow Vipers'),  -- Magante, Robert J.
    ('3190284c-50c3-43d7-a504-ab4988c8c1ed'::uuid, 'Group 6 - Red Foxes'),  -- Magpulong, Erwin A
    ('bd2401e0-7858-431f-9cf8-f805dbade82b'::uuid, 'Group 8 - Orange Tigers'),  -- Mahumok, Juvet A.
    ('215bf399-dba8-4796-8426-4443a1a7f87e'::uuid, 'Group 4 - Gray Wolves'),  -- Malolot, Denmark S.
    ('65f9600b-e1db-41a3-bd2e-bd199451f3de'::uuid, 'Group 2 - Pink Flamingos'),  -- Manago, Charlito C.
    ('5de040c0-8c89-48d2-a4fc-275feb0400bd'::uuid, 'Group 6 - Red Foxes'),  -- Manga, John Michael M.
    ('a120e87c-b34d-4017-a56b-8a945f8a12a4'::uuid, 'Group 3 - Yellow Vipers'),  -- Manlegro, Jenie S
    ('bfc90a8e-bde0-46c7-a5aa-bc2c1a7f83b6'::uuid, 'Group 4 - Gray Wolves'),  -- Manlegro, Mary Grace D.
    ('2d55264a-4bb9-46bf-b3c2-5a4a4984b5fa'::uuid, 'Group 6 - Red Foxes'),  -- Manlegro, Roy L.
    ('f34b5e6e-f969-43a5-83fc-5bfc20aebd12'::uuid, 'Group 8 - Orange Tigers'),  -- Mansing, Ian Ritche G.
    ('ef56165e-1d89-48e7-9bf5-4bd4a419c3b0'::uuid, 'Group 2 - Pink Flamingos'),  -- Martinez, Keth Jazarel
    ('a153ee5e-c10a-4de4-9f23-d27b90383382'::uuid, 'Group 4 - Gray Wolves'),  -- Matalines, Arvie James M.
    ('64a0d6d9-d38b-49b9-8b4e-53d1b504d189'::uuid, 'Group 7 - Purple Peacocks'),  -- May, Carlo Renz T.
    ('7271291e-a293-44f7-afdc-9553a656c1f9'::uuid, 'Group 5 - Blue Sharks'),  -- Mercado, Kenneth D.
    ('0f3f1100-9a20-40d6-a0be-4319f64c5d23'::uuid, 'Group 3 - Yellow Vipers'),  -- Metillo, Genina
    ('f36512fa-95ce-4a6b-8d9b-89ac7b664aa6'::uuid, 'Group 4 - Gray Wolves'),  -- Minoza, Arnold G.
    ('6892b4af-9ad1-4d7d-b39b-da57b999da7e'::uuid, 'Group 8 - Orange Tigers'),  -- Mollona, Mark Roland
    ('5c25a4b4-5b59-4e53-8f48-b495df9fa7ca'::uuid, 'Group 4 - Gray Wolves'),  -- Molos, John A
    ('3455c4f5-da27-4374-958e-f3a22472daeb'::uuid, 'Group 6 - Red Foxes'),  -- Monares, Arck C.
    ('d19d0da7-6217-4e1d-98b3-0254e2cbbd64'::uuid, 'Group 5 - Blue Sharks'),  -- Mondoy, Gerry T.
    ('c0deec78-734c-4559-97a4-826d68c4c878'::uuid, 'Group 1 - White Rhinos'),  -- Montefalcon, Charlie Q
    ('24c5cf6e-b06f-4382-b51e-445490f9264b'::uuid, 'Group 4 - Gray Wolves'),  -- Montefalcon, Pecmars D
    ('c63a3d4a-3be4-4f85-a56d-3d9cbd5b1d10'::uuid, 'Group 3 - Yellow Vipers'),  -- Moreno, Venjoe S.
    ('edf78e50-5a61-462a-9ff0-b6c4a240da57'::uuid, 'Group 5 - Blue Sharks'),  -- Murallon, Analiza C
    ('d62d16f2-a2cc-413b-ad66-a76c00430166'::uuid, 'Group 3 - Yellow Vipers'),  -- Murallon, Jorlan T
    ('74e57c30-1a16-48f2-bc0f-6d9ebee4cc7a'::uuid, 'Group 1 - White Rhinos'),  -- Ofamen, Virgilio A
    ('bd37c7a8-bc8f-43f6-b9a2-e1c6fd26fdf6'::uuid, 'Group 2 - Pink Flamingos'),  -- Ongco, Mary Ann S
    ('c07662db-03ba-46a7-bf60-949270490f8d'::uuid, 'Group 7 - Purple Peacocks'),  -- Ordo&#241;ez, Ana A.
    ('16797797-e1b6-40f3-85a8-30237b9a8b03'::uuid, 'Group 3 - Yellow Vipers'),  -- Osain, Edilyn Jane P.
    ('6dd0c2a8-2ee4-4175-89b6-67bc071d7968'::uuid, 'Group 5 - Blue Sharks'),  -- Pabatao, Stephen Matthew B.
    ('079db54b-5569-4591-8f19-6b40f7fc7875'::uuid, 'Group 3 - Yellow Vipers'),  -- PABLEO, HOPE B.
    ('83a266a3-0ddf-4486-b0fd-aae8a4ba6595'::uuid, 'Group 1 - White Rhinos'),  -- Pacoy, Jecel F.
    ('870cc4d9-7c8f-4df9-83e7-2039cc01d533'::uuid, 'Group 7 - Purple Peacocks'),  -- Pactol, Shirley Jane N.
    ('a6777288-5f27-43cb-810f-935d2f4881cd'::uuid, 'Group 6 - Red Foxes'),  -- Padilla, Anabel T
    ('7488be16-3db5-45e8-b4e9-783eb17100f4'::uuid, 'Group 5 - Blue Sharks'),  -- Padilla, Reinheart C.
    ('a5100d84-5b42-4ad3-b5e9-4e1bc46c182d'::uuid, 'Group 5 - Blue Sharks'),  -- Palang, Paul Neil H.
    ('124bae4c-8a0b-4da0-a736-cdbb6bc467f6'::uuid, 'Group 1 - White Rhinos'),  -- Paler, Ulysis Y
    ('49eaf067-4bb1-498e-94d9-ead98329c905'::uuid, 'Group 5 - Blue Sharks'),  -- Pantalla, Jasmin P
    ('58dbb0b9-c8d9-432c-8590-c1a8b5ee6378'::uuid, 'Group 8 - Orange Tigers'),  -- Pantonial, Michell Ann L
    ('d1816ffe-e0a2-4969-a00a-dd600fdd8bf1'::uuid, 'Group 3 - Yellow Vipers'),  -- Papaya, Tammy A.
    ('c65f47ce-73b6-4d37-be8d-3d7dfa159bb4'::uuid, 'Group 3 - Yellow Vipers'),  -- Pegalan, Annie Rose S
    ('1ca17216-04fb-4336-b956-a4dce84edbd6'::uuid, 'Group 4 - Gray Wolves'),  -- Perolino, Ellavar P.
    ('c9f72e77-bbf6-4c4a-bd0f-a32b274d526d'::uuid, 'Group 1 - White Rhinos'),  -- Propongo, Dante S
    ('6df9459c-8b55-47ee-9e2b-37978f8a2712'::uuid, 'Group 8 - Orange Tigers'),  -- Punzalan, Darlene Christie M.
    ('1ee25fca-18a0-4bc4-9dad-5947107e9886'::uuid, 'Group 1 - White Rhinos'),  -- Purgatorio, Jonie E
    ('54270a48-df08-4fd5-8d13-1ba50ee736ce'::uuid, 'Group 2 - Pink Flamingos'),  -- Quiane, Angel Faith R.
    ('497cd233-c63d-430d-b055-81bed62b3fb8'::uuid, 'Group 4 - Gray Wolves'),  -- Quihoy, Marjonly R.
    ('04d62fe7-3d44-44f8-b0df-5a7b3b2e87ab'::uuid, 'Group 2 - Pink Flamingos'),  -- Quinto, Demi Mabelle
    ('ebbfc3a0-5fa0-4b7b-a3ee-418c4bf3acef'::uuid, 'Group 4 - Gray Wolves'),  -- Quinto, Juvy A.
    ('45f36505-2da3-4760-8069-1c3c427ad29f'::uuid, 'Group 5 - Blue Sharks'),  -- Quirante, Reymond C
    ('748d269a-26b2-4c22-85d4-9512000740a8'::uuid, 'Group 5 - Blue Sharks'),  -- Qu&#241;ones, Edward L
    ('977fc9fe-0977-4fc9-abd2-ac4e307c5d43'::uuid, 'Group 7 - Purple Peacocks'),  -- Rabago, Sam Elmer S.
    ('eb790eef-e9d9-4534-8586-735c21d5a14b'::uuid, 'Group 2 - Pink Flamingos'),  -- Rada, Revijhan V.
    ('d6f93b39-3f69-4c84-8d17-a464bb9ea8f6'::uuid, 'Group 6 - Red Foxes'),  -- Ramayrat, Jerryfe C
    ('f852c8cf-7970-4cf0-92f3-010c72eb420f'::uuid, 'Group 1 - White Rhinos'),  -- Ramayrat, Roland R
    ('082314b1-5ce3-4730-8af5-7ae8b34765f6'::uuid, 'Group 5 - Blue Sharks'),  -- Ramos, Wilson M
    ('c0909953-d0d0-4152-9dd0-c60a6bbc5a57'::uuid, 'Group 6 - Red Foxes'),  -- Recto, Gladys Hope C.
    ('26029017-10b7-472f-aa67-edd1d26b09a2'::uuid, 'Group 4 - Gray Wolves'),  -- Redoble, Rolly P
    ('9669c532-5a08-4f88-83b6-c01bdb0a0776'::uuid, 'Group 8 - Orange Tigers'),  -- Repolles, Danny A.
    ('238d1267-3264-45b6-920f-27044ee33e39'::uuid, 'Group 8 - Orange Tigers'),  -- Repolles, Einstien Jay R.
    ('8af91d63-debb-4bf3-a8e5-9c4ac8890b93'::uuid, 'Group 8 - Orange Tigers'),  -- Repolles, Joseph S.
    ('f8038faa-947f-4bac-b2ef-d31f757d044f'::uuid, 'Group 8 - Orange Tigers'),  -- Reyes, Rechielyn B.
    ('4179d42c-a088-47cd-970c-962b8600d231'::uuid, 'Group 6 - Red Foxes'),  -- Roa, Marissa E.
    ('c20281d1-7136-4910-80b7-bf7ad91ef771'::uuid, 'Group 4 - Gray Wolves'),  -- Rocas, John Paul O.
    ('f87f1201-0090-4989-9387-b66260f690eb'::uuid, 'Group 6 - Red Foxes'),  -- Rupinta, Francis Lyn R
    ('e069d93d-47ae-411d-9f85-2faec6425d80'::uuid, 'Group 1 - White Rhinos'),  -- Sabayton, Teresito Z.
    ('de3d27a4-6145-4851-940c-4710ce58654c'::uuid, 'Group 6 - Red Foxes'),  -- Salig, Japeth V
    ('ec741957-13a9-4fb7-b06e-f5ef624da9f0'::uuid, 'Group 4 - Gray Wolves'),  -- Salig, Mark Fe R.
    ('5175fbf7-a34c-4c26-b80b-d9f73b46f4d0'::uuid, 'Group 1 - White Rhinos'),  -- Salomon, Dejie T.
    ('0c274d94-777c-4212-b11d-00ad23dd3c4a'::uuid, 'Group 8 - Orange Tigers'),  -- Salomon, Shirly V.
    ('c502970e-8ced-4277-9d9d-015159a6113f'::uuid, 'Group 5 - Blue Sharks'),  -- Salvador, Lorraine Jane G
    ('09adffe5-6443-4551-8fff-5f3a1b1607c6'::uuid, 'Group 7 - Purple Peacocks'),  -- Samson, Marlon Jose M
    ('2da7da1f-eae5-4705-878d-07dc9f692be2'::uuid, 'Group 7 - Purple Peacocks'),  -- Santander, Ariel L.
    ('1aceb270-1ddc-47fe-b9a0-c007cfc09e9d'::uuid, 'Group 3 - Yellow Vipers'),  -- Santander, Bonifacio L.
    ('fa246140-7c16-4000-9daa-e0faa1f19d59'::uuid, 'Group 8 - Orange Tigers'),  -- Saquin, Jerry B.
    ('f5ce1a19-eb1e-48ab-abe1-9f94c9e8d906'::uuid, 'Group 1 - White Rhinos'),  -- Saquin, Ven Seven S.
    ('305d901b-f9c4-49ec-b782-0ea10e991e0a'::uuid, 'Group 5 - Blue Sharks'),  -- Sarabia, Victor P Jr.
    ('2000f475-8768-4ebc-962c-0a08e189f21b'::uuid, 'Group 3 - Yellow Vipers'),  -- Saulong, Rex Olegario N.
    ('67ae868b-1516-44a8-af22-5852211add91'::uuid, 'Group 5 - Blue Sharks'),  -- Sebandal, Renlijun M.
    ('ebc6fa55-249b-4ee0-989f-02679e4e17f3'::uuid, 'Group 3 - Yellow Vipers'),  -- Senarillos, Efren B. JR.
    ('40c5d82c-e1fd-4558-8dad-b75dca1c3e8d'::uuid, 'Group 2 - Pink Flamingos'),  -- Sevilla, Novenn R.
    ('0654c7bd-e4af-4483-a39e-1b1eed844aa2'::uuid, 'Group 3 - Yellow Vipers'),  -- Sila, Ramil R.
    ('64dd5345-50b6-470b-b2ad-fdfb5e0c1f07'::uuid, 'Group 4 - Gray Wolves'),  -- Sino, Primo D.
    ('89907f99-9251-4a41-80a8-0e7fe9530819'::uuid, 'Group 5 - Blue Sharks'),  -- Solijon, Kent Mark
    ('bf505bfe-b4cd-4c64-81a4-cf20779a3d4a'::uuid, 'Group 3 - Yellow Vipers'),  -- Soliman, Edberg C.
    ('5758343e-7347-4d21-b795-d7e72c751f72'::uuid, 'Group 8 - Orange Tigers'),  -- Suganob, Francis N.
    ('6ff8d98f-393e-4924-bc5a-9eaac3849381'::uuid, 'Group 2 - Pink Flamingos'),  -- Suganob, Minette N.
    ('587a79b2-b6fc-4f0c-8a64-cdeade896c66'::uuid, 'Group 8 - Orange Tigers'),  -- Sulasula, Vierne P.
    ('c4ce0f3e-5e8b-44e1-8fd7-7c337a62d010'::uuid, 'Group 2 - Pink Flamingos'),  -- Sumalinog, Milfred G.
    ('3e65c023-6ee7-4bdd-9485-3b15822d2289'::uuid, 'Group 5 - Blue Sharks'),  -- Superable, Aimee
    ('c7aa6aca-346e-4e61-9c05-8f339cb2e19d'::uuid, 'Group 1 - White Rhinos'),  -- Tabanas, Marjun B
    ('3b71eef4-b456-47e5-beb0-52ec83cd94f9'::uuid, 'Group 5 - Blue Sharks'),  -- Taburada, Roy S.
    ('8d967c2e-86b1-4158-bd8c-598422b90a48'::uuid, 'Group 5 - Blue Sharks'),  -- Tacastacas, Client Harvey P.
    ('edf998be-9838-4749-bf9d-a2160e08b28f'::uuid, 'Group 4 - Gray Wolves'),  -- Taga-an, Rhell Early J.
    ('642ff305-6fa4-4ec9-9a27-edf9a2ea4020'::uuid, 'Group 4 - Gray Wolves'),  -- Tag-at, Archel B.
    ('0352086a-ddef-4bdc-9ab9-eb460a73164c'::uuid, 'Group 5 - Blue Sharks'),  -- Tambiga, Mary Anne A
    ('1ead1d5d-2ea3-486d-b977-2e1cc2e769a5'::uuid, 'Group 6 - Red Foxes'),  -- Tano, Jhonas T
    ('674b80e6-8eb0-4a90-b3e1-7d5b9efa6859'::uuid, 'Group 8 - Orange Tigers'),  -- Tigolo, Radnie A.
    ('f2813585-f73b-45f8-88f8-0dd3e114c418'::uuid, 'Group 2 - Pink Flamingos'),  -- Tigolo, Ricardo A. JR
    ('3cce0abd-540a-429c-a30c-b84b843ccad7'::uuid, 'Group 1 - White Rhinos'),  -- Tomatao, Jake E.
    ('21b6c384-1649-46ae-b137-10e9dcb0ffb3'::uuid, 'Group 2 - Pink Flamingos'),  -- Tual, Rowena S.
    ('b2f8778c-136f-4c6f-a2ca-bb4e7c760f19'::uuid, 'Group 8 - Orange Tigers'),  -- Tubac, Don R
    ('c249a1f3-c636-4b27-a3d8-5811945c0817'::uuid, 'Group 4 - Gray Wolves'),  -- Umpay, Mark Dan E.
    ('64aa6797-4ef1-455a-93dd-d4596784b605'::uuid, 'Group 6 - Red Foxes'),  -- Unido, Edgar A.
    ('cfabd251-d877-4acd-90f3-dc1dccfc8452'::uuid, 'Group 3 - Yellow Vipers'),  -- Velayo, Rolando C.
    ('ae3b8ce2-6449-4e91-8d86-cbca566e4e18'::uuid, 'Group 6 - Red Foxes'),  -- Verdida, Amie Grace P.
    ('6affe24e-abf5-4b7c-95b6-ee70c92d5298'::uuid, 'Group 4 - Gray Wolves'),  -- Vidad, Erhma Fria Feb B.
    ('17afb3c3-ac26-43d8-b3f3-a48de67bcac5'::uuid, 'Group 8 - Orange Tigers'),  -- Villacorta, Grace Joy S.
    ('fbfa61d3-966d-4902-9408-deb33d562279'::uuid, 'Group 6 - Red Foxes'),  -- Villacorta, Joville Jethro S.
    ('87c7a1c5-ac79-4541-bd82-b90bda99fd5c'::uuid, 'Group 8 - Orange Tigers'),  -- Villaganas, Abner T.
    ('19707e04-d589-4720-b654-4c26e5386bd8'::uuid, 'Group 6 - Red Foxes'),  -- Villanueva, Stephen M.
    ('1d26ad0d-a134-4314-8fc0-581033c6cbfb'::uuid, 'Group 4 - Gray Wolves'),  -- Virtudez, Bon Jovi E.
    ('4c23af4c-c852-4e59-8344-7ef8b89ead1c'::uuid, 'Group 6 - Red Foxes'),  -- Maghuyop Rosendo Jr. V.
    ('2946ce8d-d92d-4cf3-bfc6-4e4556ffff45'::uuid, 'Group 3 - Yellow Vipers'),  -- Wong, Bill Hussein Y.
    ('ccc1039a-1c82-43d6-a25b-442b6e78e1d0'::uuid, 'Group 1 - White Rhinos'),  -- Yurong, Leonora V
    ('bda30186-71b7-48a6-9a94-1ae1a26640b5'::uuid, 'Group 5 - Blue Sharks'),  -- Zamora, Danilo L. Jr.
    ('4bf27703-c559-4f83-a2ab-9666b73b70c5'::uuid, 'Group 5 - Blue Sharks')  -- ZAMORA , KHENT G.
) AS v (id, csc_team)
WHERE t.id = v.id
  AND t.csc_team IS DISTINCT FROM v.csc_team;

-- ── COS — 33 people ─────────────────────────────────────
UPDATE hris.cos_employees AS t
SET csc_team = v.csc_team
FROM (VALUES
    ('fd0d828a-f05e-4d56-be99-31239aa9b491'::uuid, 'Group 3 - Yellow Vipers'::text),  -- ALINAS, VICTOR REYES JR.
    ('8cb414ac-e54b-45ad-81fd-3d11ece5dc8f'::uuid, 'Group 3 - Yellow Vipers'),  -- ALMEROL, WISHKA S
    ('8a271a2c-d18e-498b-a0d5-c189e0df3cf5'::uuid, 'Group 1 - White Rhinos'),  -- ANG, MERLINDA MANLEGRO
    ('48060c6c-27df-4a5c-ad5f-93bfd2c5abbc'::uuid, 'Group 7 - Purple Peacocks'),  -- CARILLO, ROMART REY AUREA
    ('1fb131df-4609-4225-bd7c-4e8ccd8a949a'::uuid, 'Group 4 - Gray Wolves'),  -- DESCALLAR, JAY OLIVER A
    ('0e8f163e-123d-489b-a9ad-658342c564f9'::uuid, 'Group 7 - Purple Peacocks'),  -- ENGUITO, IVAN JADE CAMPACINO
    ('c130c70b-bad1-4007-89bd-75dbb822e435'::uuid, 'Group 8 - Orange Tigers'),  -- ENRIQUEZ, PERLIE P.
    ('ac57ec9c-1d4e-4fe2-a319-e13f918290fa'::uuid, 'Group 3 - Yellow Vipers'),  -- FERRAREN, JEMA BATHAN
    ('faef8429-e574-46be-8a18-d80ec364e9ca'::uuid, 'Group 4 - Gray Wolves'),  -- FUENTES, MARIA APRIL GLO NADINE CELESTE SEVENORIO
    ('06e37fe0-5bbe-45cd-a90b-fa39973ea7ad'::uuid, 'Group 7 - Purple Peacocks'),  -- JIMENEZ, LORNA CAJETA
    ('f15fbee7-4306-4180-b438-dc5653f27622'::uuid, 'Group 1 - White Rhinos'),  -- LOBITANA, LEMUEL NINO OBINA
    ('912e30e6-94de-427d-afcb-752bcb686bf8'::uuid, 'Group 6 - Red Foxes'),  -- LUNA, MARIA LYNNETTE CEBEDO
    ('010b9320-bf0c-47ec-ba5f-1795412ccf1f'::uuid, 'Group 1 - White Rhinos'),  -- MALAUBANG, RENZ JUNESSA BLANCA
    ('39b49a15-a583-4e82-9340-e7734715ff7d'::uuid, 'Group 1 - White Rhinos'),  -- MANGINSAY, MA. ARJAY CRISTE CORDERO
    ('babb36b4-51fb-46f6-8e2c-751ba14d197f'::uuid, 'Group 6 - Red Foxes'),  -- MANILA, GHINEDEL NACIONAL
    ('668bd519-34bf-4c21-bce1-1fe2438319c2'::uuid, 'Group 3 - Yellow Vipers'),  -- MAYORDO, ROGEN BEJEC
    ('2d215698-19bb-42aa-af7c-978a984a5c64'::uuid, 'Group 3 - Yellow Vipers'),  -- MONTALBAN, LAURENCE LAURETE
    ('d04351f4-6c30-4bff-be99-eff72da1b2e3'::uuid, 'Group 5 - Blue Sharks'),  -- NIERE, JESYLL TANATO
    ('d33d48d9-ec75-41e3-9030-5b71ff8f9b0f'::uuid, 'Group 1 - White Rhinos'),  -- OMILD, LARRY CABACUG
    ('bfc666f6-6396-463b-8106-8314b88b0900'::uuid, 'Group 5 - Blue Sharks'),  -- ORONG, HARVEY MALLARI
    ('80008753-a771-4641-83de-1eea481be75e'::uuid, 'Group 8 - Orange Tigers'),  -- PABRIGA, MARIA RITA ABABON
    ('2efd4ab1-8f29-494c-b770-4d3dd7c22e92'::uuid, 'Group 2 - Pink Flamingos'),  -- PADILLA, JERRY ACOSTA JR.
    ('aad1471b-c333-495f-b144-9db75e0b68e5'::uuid, 'Group 2 - Pink Flamingos'),  -- PALOMO, COSMELITO DOLALAS
    ('d2fc674f-d716-445f-ae52-2668f741a5be'::uuid, 'Group 5 - Blue Sharks'),  -- PASCO, GERRY MAE L
    ('41b20711-d45b-43d6-9c3b-3eca077a7cb3'::uuid, 'Group 5 - Blue Sharks'),  -- POLITO, MERIAM documento
    ('c464fee8-2841-40c6-8e6c-07a701459671'::uuid, 'Group 6 - Red Foxes'),  -- QUINIT, FILDA JOY JOPSON
    ('b1e4a79a-4443-4936-a5fa-cc637d4f6073'::uuid, 'Group 8 - Orange Tigers'),  -- RABAGO, JAMES LELAND SALVA
    ('50d6eff0-a919-40b8-946e-51f7911bf857'::uuid, 'Group 6 - Red Foxes'),  -- RESUELO, ADORA JEAN ARANAYDO
    ('893dfb37-1b28-4d43-bf82-19dfc791b768'::uuid, 'Group 6 - Red Foxes'),  -- SAQUIN, PRINCE LLOYD LAPAR
    ('87612296-3da4-45a8-b0bc-fc8363710a8d'::uuid, 'Group 8 - Orange Tigers'),  -- SULITA, FRANKLIN BALUYA
    ('37274050-f607-4794-8610-8605ee4e3fb6'::uuid, 'Group 8 - Orange Tigers'),  -- TAGO, EMERALD HOLLY BALIBALOS
    ('3ab0f428-960b-41fb-b663-a0f528f90f64'::uuid, 'Group 7 - Purple Peacocks'),  -- TAPITAN, MARITESS MALALIS
    ('c9db68ce-17f2-4fd6-9d53-1ecb8f262d82'::uuid, 'Group 3 - Yellow Vipers')  -- YAP, TERESITA MORALES
) AS v (id, csc_team)
WHERE t.id = v.id
  AND t.csc_team IS DISTINCT FROM v.csc_team;

-- ── The 61 temporary records from 084 ────────────────────────────────────
--
-- 084 wrote the labels in the earlier spreadsheet's vocabulary
-- ("Group 1 (WHITE)"). This file uses the vocabulary of the newer export
-- ("Group 1 - White Rhinos"), which covers fifteen times as many people, so
-- the temporaries are rewritten to match. One spelling per team is the point:
-- two spellings means every group-by silently reports sixteen teams.
UPDATE hris.employees
SET csc_team = CASE csc_team
  WHEN 'Group 1 (WHITE)'  THEN 'Group 1 - White Rhinos'
  WHEN 'Group 2 (PINK)'   THEN 'Group 2 - Pink Flamingos'
  WHEN 'Group 3 (YELLOW)' THEN 'Group 3 - Yellow Vipers'
  WHEN 'Group 4 (GRAY)'   THEN 'Group 4 - Gray Wolves'
  WHEN 'Group 5 (BLUE)'   THEN 'Group 5 - Blue Sharks'
  WHEN 'Group 6 (RED)'    THEN 'Group 6 - Red Foxes'
  WHEN 'Group 7 (PURPLE)' THEN 'Group 7 - Purple Peacocks'
  WHEN 'Group 8 (ORANGE)' THEN 'Group 8 - Orange Tigers'
END
WHERE csc_team LIKE 'Group_%(%)';
