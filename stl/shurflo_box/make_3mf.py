"""Packs the two-colour handle into ONE 3MF: one object with two parts (handle + ANX3D logo).
Run:  python3 make_3mf.py   ->  carry_handle_2color.3mf"""
import zipfile, numpy as np, trimesh

def mesh_xml(path):
    m = trimesh.load(path, process=False)
    v = '\n'.join(f'<vertex x="{x:.4f}" y="{y:.4f}" z="{z:.4f}"/>' for x, y, z in m.vertices)
    t = '\n'.join(f'<triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in m.faces)
    return f'<mesh><vertices>\n{v}\n</vertices><triangles>\n{t}\n</triangles></mesh>'

parts = [('handle', 'carry_handle.stl', 1), ('ANX3D logo', 'carry_handle_logo.stl', 2)]
objs = ''.join(f'<object id="{i+1}" type="model" name="{n}">{mesh_xml(f)}</object>\n' for i, (n, f, _) in enumerate(parts))
comps = ''.join(f'<component objectid="{i+1}"/>' for i in range(len(parts)))
G = len(parts) + 1
model = f'''<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
<metadata name="Title">ANX3D carry handle (2 colours)</metadata>
<resources>
{objs}<object id="{G}" type="model" name="carry_handle"><components>{comps}</components></object>
</resources>
<build><item objectid="{G}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/></build>
</model>'''
settings = '<?xml version="1.0" encoding="UTF-8"?>\n<config>\n' + f'<object id="{G}">\n<metadata key="name" value="carry_handle"/>\n<metadata key="extruder" value="1"/>\n' + \
    ''.join(f'<part id="{i+1}" subtype="normal_part">\n<metadata key="name" value="{n}"/>\n<metadata key="extruder" value="{e}"/>\n</part>\n' for i, (n, _, e) in enumerate(parts)) + \
    '</object>\n</config>\n'
with zipfile.ZipFile('carry_handle_2color.3mf', 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
               '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
               '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>'
               '<Default Extension="config" ContentType="text/xml"/></Types>')
    z.writestr('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
               '<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>')
    z.writestr('3D/3dmodel.model', model)
    z.writestr('Metadata/model_settings.config', settings)
print('carry_handle_2color.3mf written')
